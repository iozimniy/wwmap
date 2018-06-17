package main

import (
	"github.com/and-hom/wwmap/lib/dao"
	"strings"
	log "github.com/Sirupsen/logrus"
	"io"
	"github.com/and-hom/wwmap/cron/catalog-sync/huskytm"
	"time"
	"github.com/and-hom/wwmap/cron/catalog-sync/common"
	"fmt"
	"html/template"
	"github.com/and-hom/wwmap/lib/mail"
	"github.com/and-hom/wwmap/cron/catalog-sync/tlib"
)

func (this *App) DoSyncReports() {
	huskytmReportProvider, err := huskytm.GetReportProvider(this.Configuration.Login, this.Configuration.Password)
	if err != nil {
		this.Fatalf(err, "Can not connect to source")
	}
	defer huskytmReportProvider.Close()
	this.doSyncReports(huskytm.SOURCE, &huskytmReportProvider)

	tlibReportProvider, err := tlib.GetReportProvider()
	if err != nil {
		this.Fatalf(err, "Can not connect to source")
	}
	defer tlibReportProvider.Close()
	this.doSyncReports(tlib.SOURCE, &tlibReportProvider)
}

func (this *App) doSyncReports(source string, reportProvider *common.ReportProvider) {
	lastId, err := this.VoyageReportDao.GetLastId(source)
	if err != nil {
		this.Fatalf(err, "Can not connect get last report id")
	}
	log.Infof("Get and store reports from %s since %s", source, lastId.(time.Time).Format(huskytm.TIME_FORMAT))

	reports, next, err := (*reportProvider).ReportsSince(lastId.(time.Time))
	if err != nil {
		log.Fatal(err, "Can not get posts")
	}
	if len(reports) == 0 {
		next = lastId.(time.Time)
	}

	reports, err = this.VoyageReportDao.UpsertVoyageReports(reports...)
	if err != nil {
		this.Fatalf(err, "Can not store reports from %s: %v", source, reports)
	}

	log.Infof("%d reports from %s are successfully stored. Next id is %s\n", len(reports), source, next)

	reportsToRivers := make(map[int64][]dao.RiverTitle)
	for i:=0;i<len(reports);i++ {
		reportsToRivers[reports[i].Id] = make([]dao.RiverTitle, 0)
	}

	log.Info("Try to connect reports with known rivers")
	err = this.associateReportsWithRivers(&reportsToRivers)
	if err != nil {
		log.Fatal("Can not associate rivers with reports: ", err)
	}

	for _, report := range reports {
		rivers, found := reportsToRivers[report.Id]
		if !found {
			rivers = []dao.RiverTitle{}
		}
		this.findMatchAndStoreImages(report, rivers, reportProvider)
	}
}

func (this *App) associateReportsWithRivers(resultHandlerMap *map[int64][]dao.RiverTitle) error {
	fmt.Println("fvv")
	return this.VoyageReportDao.ForEach(func (report *dao.VoyageReport) error {
		return this.associateReportWithRiver(report, resultHandlerMap)
	})
}

func (this *App) associateReportWithRiver(report *dao.VoyageReport, resultHandlerMap *map[int64][]dao.RiverTitle) error {
	log.Infof("Tags are: %v", report.Tags)
	rivers, err := this.RiverDao.FindTitles(report.Tags)
	if err != nil {
		return err
	}
	log.Info(rivers)
	for _, river := range rivers {
		err := this.VoyageReportDao.AssociateWithRiver(report.Id, river.Id)
		if err != nil {
			return err
		}
		riversForReport, found := (*resultHandlerMap)[report.Id]
		if found {
			(*resultHandlerMap)[report.Id] = append(riversForReport, river)
		}
	}
	return nil
}

func (this *App) findMatchAndStoreImages(report dao.VoyageReport, rivers []dao.RiverTitle, reportProvider *common.ReportProvider) {
	log.Infof("Find images for report %d: %s %s", report.Id, report.RemoteId, report.Title)
	imgs, err := (*reportProvider).Images(report.RemoteId)
	if err != nil {
		this.Fatalf(err, "Can not load images for report %d", report.Id)
	}
	log.Infof("%d images found for %s %d", len(imgs), report.Source, report.Id)
	log.Infof("Bind images to ww spots for report %d", report.Id)
	matchedImgs := []dao.Img{}
	candidates := this.matchImgsToWhiteWaterPoints(report, imgs, rivers)
	log.Infof("%d images matched for %s %d", len(candidates), report.Source, report.Id)

	for _, imgToWwpts := range candidates {
		if len(imgToWwpts.Wwpts) == 1 {
			imgToWwpts.Img.WwId = imgToWwpts.Wwpts[0].Id
			matchedImgs = append(matchedImgs, imgToWwpts.Img)
		} else if len(imgToWwpts.Wwpts) > 1 {
			log.Warn("More then one white water point for img ", imgToWwpts.Img.RemoteId)
		}
	}

	log.Infof("Store %d images for report %d", len(matchedImgs), report.Id)
	_, err = this.ImgDao.Upsert(matchedImgs...)
	if err != nil {
		this.Fatalf(err, "Can not upsert images for report %d", report.Id, )
	}
}

type ImgWwPoints struct {
	Img   dao.Img
	Wwpts []dao.WhiteWaterPointWithRiverTitle
}

func (this *App) matchImgsToWhiteWaterPoints(report dao.VoyageReport, imgs []dao.Img, rivers []dao.RiverTitle) map[string]ImgWwPoints {
	candidates := make(map[string]ImgWwPoints)
	for _, img := range imgs {
		for _, river := range rivers {
			wwpts, err := this.WhiteWaterDao.ListByRiver(river.Id)
			if err != nil {
				this.Fatalf(err, "Can not list white water spots for river %d", river.Id)
			}
			for _, wwpt := range wwpts {
				for _, label := range img.LabelsForSearch {
					if strings.Contains(forCompare(label), forCompare(wwpt.Title)) {
						fmt.Println("Found: ", label)
						rec, found := candidates[img.RemoteId]
						img.ReportId = report.Id
						if !found {
							rec = ImgWwPoints{
								Img:img,
								Wwpts:[]dao.WhiteWaterPointWithRiverTitle{},
							}
						}
						rec.Wwpts = append(rec.Wwpts, wwpt)
						candidates[img.RemoteId] = rec
					}
				}
			}
		}
	}
	return candidates
}

func forCompare(s string) string {
	return strings.Replace(strings.Replace(strings.ToLower(s), "ё", "e", -1), "-", " ", -1)
}

func (this *App) Fatalf(err error, pattern string, args ...interface{}) {
	this.Report(err)
	log.Fatalf(pattern + ": " + err.Error(), args)
}

func (this *App) Report(err error) {
	templateData, err := emailTemplateBytes()
	if err != nil {
		log.Fatal("Can not load email template:\t", err)
	}

	tmpl, err := template.New("report-email").Parse(string(templateData))
	if err != nil {
		log.Fatal("Can not compile email template:\t", err)
	}

	err = mail.SendMail(this.Notifications.EmailSender, this.Notifications.EmailRecipients, this.Notifications.ImportExportEmailSubject, func(w io.Writer) error {
		return tmpl.Execute(w, *this.stat)
	})
}
