package pdf

import (
	"fmt"
	log "github.com/Sirupsen/logrus"
	"github.com/and-hom/wwmap/cron/catalog-sync/common"
	"github.com/and-hom/wwmap/cron/catalog-sync/pdf/templates"
	"github.com/and-hom/wwmap/lib/blob"
	"github.com/and-hom/wwmap/lib/dao"
	"strings"
)

const SOURCE = "pdf"

func GetCatalogConnector(pdfStorage, htmlStorage blob.BlobStorage, pageLinkTemplate string) (common.CatalogConnector, error) {
	t, err := common.LoadTemplates(templates.MustAsset)
	if err != nil {
		return nil, err
	}

	return &PdfCatalogConnector{
		templates:        t,
		pdfStorage:       pdfStorage,
		htmlStorage:      htmlStorage,
		spotBuf:          []common.SpotPageDto{},
		pageLinkTemplate: pageLinkTemplate,
	}, nil
}

type PdfCatalogConnector struct {
	pdfStorage       blob.BlobStorage
	htmlStorage      blob.BlobStorage
	templates        common.Templates
	spotBuf          []common.SpotPageDto
	pageLinkTemplate string
}

func (this *PdfCatalogConnector) SourceId() string {
	return SOURCE
}

func (this *PdfCatalogConnector) Close() error {
	return nil
}

func (this *PdfCatalogConnector) CreateEmptyPageIfNotExistsAndReturnId(id int64, parent int, pageId int, title string) (int, string, bool, error) {
	return int(id), fmt.Sprintf(this.pageLinkTemplate, id), true, nil
}

func (this *PdfCatalogConnector) WriteSpotPage(page common.SpotPageDto) error {
	this.spotBuf = append(this.spotBuf, page)
	return nil
}
func (this *PdfCatalogConnector) WriteRiverPage(page common.RiverPageDto) error {
	b, err := this.templates.WriteRiver(RiverPageDto{RiverPageDto: page, Spots: this.spotBuf,})
	if err != nil {
		log.Errorf("Can not process template", err)
		return err
	}
	err = this.writePage(page.Id, b, page.River.Title)
	this.spotBuf = []common.SpotPageDto{}
	return err
}
func (this *PdfCatalogConnector) WriteRegionPage(page common.RegionPageDto) error {
	return nil
}
func (this *PdfCatalogConnector) WriteCountryPage(page common.CountryPageDto) error {
	return nil
}

func (this *PdfCatalogConnector) WriteRootPage(page common.RootPageDto) error {
	return nil
}

func (this *PdfCatalogConnector) writePage(pageId int, body string, title string) error {
	this.htmlStorage.Store(fmt.Sprintf("%d.htm", pageId), strings.NewReader(body))
	log.Infof("Write page %d for %s", pageId, title)
	return nil
}

func (this *PdfCatalogConnector) PassportEntriesSince(key string) ([]dao.WWPassport, error) {
	return []dao.WWPassport{}, nil
}
func (this *PdfCatalogConnector) GetPassport(key string) (dao.WhiteWaterPoint, error) {
	return dao.WhiteWaterPoint{}, nil
}
func (this *PdfCatalogConnector) GetImages(key string) ([]dao.Img, error) {
	return []dao.Img{}, nil
}

type PageNotFoundError struct {
	msg string
}

func (this PageNotFoundError) Error() string {
	return this.msg
}

type RiverPageDto struct {
	common.RiverPageDto
	Spots []common.SpotPageDto
}
