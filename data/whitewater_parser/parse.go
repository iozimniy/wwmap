package main

import (
	"github.com/kokardy/saxlike"
	"os"
	"github.com/and-hom/wwmap/lib/dao"
	"log"
	"github.com/and-hom/wwmap/lib/config"
)

func main() {
	configuration := config.Load("")
	configuration.ChangeLogLevel()

	r, err := os.Open(os.Args[1])
	if err != nil {
		log.Fatal(err)
	}
	defer r.Close()

	storage := dao.NewPostgresStorage(configuration.Db)
	whiteWaterDao := dao.NewWhiteWaterPostgresDao(storage)
	store := func(wpts[]dao.WhiteWaterPoint) {
		err := whiteWaterDao.InsertWhiteWaterPoints(wpts...)
		if err != nil {
			log.Fatal(err)
		}
	}

	handler := &NodeSearchHandler{
		comment:r.Name(),
		buf_size: 1,
		store: store,
	}
	parser := saxlike.NewParser(r, handler)
	parser.SetHTMLMode()
	parser.Parse()
}
