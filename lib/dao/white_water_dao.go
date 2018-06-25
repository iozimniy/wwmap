package dao

import (
	log "github.com/Sirupsen/logrus"
	"database/sql"
	"encoding/json"
	"github.com/and-hom/wwmap/lib/geo"
	"github.com/and-hom/wwmap/lib/model"
	"strings"
	"github.com/and-hom/wwmap/lib/dao/queries"
	"fmt"
)

func NewWhiteWaterPostgresDao(postgresStorage PostgresStorage) WhiteWaterDao {
	return whiteWaterStorage{
		PostgresStorage:postgresStorage,
		listByBoxQuery: queries.SqlQuery("white-water", "by-box"),
		listByRiverQuery: queries.SqlQuery("white-water", "by-river"),
		listByRiverAndTitleQuery: queries.SqlQuery("white-water", "by-river-and-title"),
		listWithPathQuery: queries.SqlQuery("white-water", "with-path"),
		insertQuery: queries.SqlQuery("white-water", "insert"),
		updateQuery: queries.SqlQuery("white-water", "update"),
		byIdQuery: queries.SqlQuery("white-water", "by-id"),
		byIdFullQuery: queries.SqlQuery("white-water", "by-id-full"),
		updateFullQuery: queries.SqlQuery("white-water", "update-full"),
	}
}

type whiteWaterStorage struct {
	PostgresStorage
	listByBoxQuery           string
	listByRiverQuery         string
	listByRiverAndTitleQuery string
	listWithPathQuery        string
	insertQuery              string
	updateQuery              string
	byIdQuery                string
	byIdFullQuery            string
	updateFullQuery          string
}

func (this whiteWaterStorage) ListWithPath() ([]WhiteWaterPointWithPath, error) {
	return this.listWithPath("");
}

func (this whiteWaterStorage) ListByBbox(bbox geo.Bbox) ([]WhiteWaterPointWithRiverTitle, error) {
	return this.list(this.listByBoxQuery, bbox.X1, bbox.Y1, bbox.X2, bbox.Y2)
}

func (this whiteWaterStorage) ListByRiver(id int64) ([]WhiteWaterPointWithRiverTitle, error) {
	return this.list(this.listByRiverQuery, id)
}

func (this whiteWaterStorage) ListByRiverAndTitle(riverId int64, title string) ([]WhiteWaterPointWithRiverTitle, error) {
	return this.list(this.listByRiverAndTitleQuery, riverId, title)
}

func (this whiteWaterStorage) Find(id int64) (WhiteWaterPointWithRiverTitle, error) {
	found, err := this.list(this.byIdQuery, id)
	if err != nil {
		return WhiteWaterPointWithRiverTitle{}, err
	}
	if len(found) == 0 {
		return WhiteWaterPointWithRiverTitle{}, fmt.Errorf("Spot with id %d not found", id)
	}
	return found[0], nil
}

func (this whiteWaterStorage) FindFull(id int64) (WhiteWaterPointFull, error) {
	result, found, err := this.doFindAndReturn(this.byIdFullQuery, func(rows *sql.Rows) (interface{}, error) {
		wwp := WhiteWaterPointFull{}

		pointString := ""
		categoryString := ""
		lwCategoryString := ""
		mwCategoryString := ""
		hwCategoryString := ""

		err := rows.Scan(&wwp.Id, &wwp.Title, &pointString, &categoryString, &wwp.ShortDesc, &wwp.Link,
			&wwp.River.Id, &wwp.River.Title,
			&lwCategoryString, &wwp.LowWaterDescription, &mwCategoryString, &wwp.MediumWaterDescription, &hwCategoryString, &wwp.HighWaterDescription,
			&wwp.Orient, &wwp.Approach, &wwp.Safety, &wwp.Preview)

		err = json.Unmarshal(categoryStrBytes(categoryString), &wwp.Category)
		if err != nil {
			log.Errorf("Can not parse category %s for white water object %d: %v", categoryString, id, err)
			return WhiteWaterPoint{}, err
		}

		err = json.Unmarshal(categoryStrBytes(lwCategoryString), &wwp.LowWaterCategory)
		if err != nil {
			log.Errorf("Can not parse low water category %s for white water object %d: %v", lwCategoryString, id, err)
			return WhiteWaterPoint{}, err
		}

		err = json.Unmarshal(categoryStrBytes(mwCategoryString), &wwp.MediumWaterCategory)
		if err != nil {
			log.Errorf("Can not parse medium water category %s for white water object %d: %v", mwCategoryString, id, err)
			return WhiteWaterPoint{}, err
		}

		err = json.Unmarshal(categoryStrBytes(hwCategoryString), &wwp.HighWaterCategory)
		if err != nil {
			log.Errorf("Can not parse high water category %s for white water object %d: %v", hwCategoryString, id, err)
			return WhiteWaterPoint{}, err
		}


		var pgPoint PgPoint
		err = json.Unmarshal([]byte(pointString), &pgPoint)
		if err != nil {
			log.Errorf("Can not parse point %s for white water object %d: %v", pointString, id, err)
			return WhiteWaterPoint{}, err
		}
		wwp.Point = pgPoint.Coordinates

		wwp.RiverId = wwp.River.Id

		return wwp, err
	}, id)
	if err != nil {
		return WhiteWaterPointFull{}, err
	}
	if !found {
		return WhiteWaterPointFull{}, fmt.Errorf("Spot with id %d not found", id)
	}
	return result.(WhiteWaterPointFull), nil
}

func (this whiteWaterStorage) UpdateWhiteWaterPointsFull(whiteWaterPoints ...WhiteWaterPointFull) error {
	vars := make([]interface{}, len(whiteWaterPoints))
	for i, p := range whiteWaterPoints {
		vars[i] = p
	}
	return this.performUpdates(this.updateFullQuery,
		func(entity interface{}) ([]interface{}, error) {
			wwp := entity.(WhiteWaterPointFull)
			pointBytes, err := json.Marshal(geo.NewGeoPoint(wwp.Point))
			if err != nil {
				return nil, err
			}

			cat, err := wwp.Category.MarshalJSON()
			if err != nil {
				return nil, err
			}
			lwCat, err := wwp.LowWaterCategory.MarshalJSON()
			if err != nil {
				return nil, err
			}
			mwCat, err := wwp.MediumWaterCategory.MarshalJSON()
			if err != nil {
				return nil, err
			}
			hwCat, err := wwp.HighWaterCategory.MarshalJSON()
			if err != nil {
				return nil, err
			}

			params := []interface{}{wwp.Id, wwp.Title, string(cat), string(pointBytes), wwp.ShortDesc, wwp.Link, nullIf0(wwp.River.Id),
				string(lwCat), wwp.LowWaterDescription, string(mwCat), wwp.MediumWaterDescription, string(hwCat), wwp.HighWaterDescription,
				wwp.Orient, wwp.Approach, wwp.Safety, wwp.Preview}
			return params, nil
		}, vars...)
}

func (this whiteWaterStorage) list(query string, vars ...interface{}) ([]WhiteWaterPointWithRiverTitle, error) {
	result, err := this.doFindList(query,
		func(rows *sql.Rows) (WhiteWaterPointWithRiverTitle, error) {

			riverTitle := sql.NullString{}

			wwPoint, err := scanWwPoint(rows, &riverTitle)
			if err != nil {
				return WhiteWaterPointWithRiverTitle{}, err
			}

			whiteWaterPoint := WhiteWaterPointWithRiverTitle{
				wwPoint,
				riverTitle.String,
				[]Img{},
			}
			return whiteWaterPoint, nil
		}, vars...)
	if (err != nil ) {
		return []WhiteWaterPointWithRiverTitle{}, err
	}
	return result.([]WhiteWaterPointWithRiverTitle), nil
}

func (this whiteWaterStorage) listWithPath(query string, vars ...interface{}) ([]WhiteWaterPointWithPath, error) {
	result, err := this.doFindList(query,
		func(rows *sql.Rows) (WhiteWaterPointWithPath, error) {

			riverTitle := ""
			regionTitle := sql.NullString{}
			countryTitle := ""

			wwPoint, err := scanWwPoint(rows, &riverTitle, &regionTitle, &countryTitle)
			if err != nil {
				return WhiteWaterPointWithPath{}, err
			}

			path := []string{}
			if regionTitle.String == "" {
				path = []string{countryTitle, riverTitle, wwPoint.Title}
			} else {
				path = []string{countryTitle, regionTitle.String, riverTitle, wwPoint.Title}
			}

			whiteWaterPoint := WhiteWaterPointWithPath{
				wwPoint,
				path,
			}
			return whiteWaterPoint, nil
		}, vars...)
	if (err != nil ) {
		return []WhiteWaterPointWithPath{}, err
	}
	return result.([]WhiteWaterPointWithPath), nil
}

func scanWwPoint(rows *sql.Rows, additionalVars ...interface{}) (WhiteWaterPoint, error) {
	var err error
	id := int64(-1)
	title := ""
	pointStr := ""
	categoryStr := ""
	shortDesc := sql.NullString{}
	link := sql.NullString{}
	riverId := sql.NullInt64{}

	fields := append([]interface{}{&id, &title, &pointStr, &categoryStr, &shortDesc, &link, &riverId}, additionalVars...)
	err = rows.Scan(fields...)
	if err != nil {
		log.Errorf("Can not read from db: %v", err)
		return WhiteWaterPoint{}, err
	}

	var pgPoint PgPoint
	err = json.Unmarshal([]byte(pointStr), &pgPoint)
	if err != nil {
		log.Errorf("Can not parse point %s for white water object %d: %v", pointStr, id, err)
		return WhiteWaterPoint{}, err
	}

	category := model.SportCategory{}
	err = json.Unmarshal(categoryStrBytes(categoryStr), &category)
	if err != nil {
		log.Errorf("Can not parse category %s for white water object %d: %v", categoryStr, id, err)
		return WhiteWaterPoint{}, err
	}

	return WhiteWaterPoint{
		IdTitle: IdTitle{
			Id:id,
			Title: title,
		},
		RiverId:getOrElse(riverId, -1),
		Point: pgPoint.Coordinates,
		Category: category,
		ShortDesc: shortDesc.String,
		Link: link.String,
	}, nil
}

func categoryStrBytes(categoryStr string) []byte {
	if !(strings.HasPrefix(categoryStr, "\"") && strings.HasSuffix(categoryStr, "\"")) {
		categoryStr = "\"" + categoryStr + "\""
	}
	return []byte(categoryStr)
}

func (this whiteWaterStorage) AddWhiteWaterPoints(whiteWaterPoints ...WhiteWaterPoint) error {
	return this.update(this.insertQuery, whiteWaterPoints...)
}

func (this whiteWaterStorage) UpdateWhiteWaterPoints(whiteWaterPoints ...WhiteWaterPoint) error {
	return this.update(this.updateQuery, whiteWaterPoints...)
}

func (this whiteWaterStorage) update(query string, whiteWaterPoints ...WhiteWaterPoint) error {
	vars := make([]interface{}, len(whiteWaterPoints))
	for i, p := range whiteWaterPoints {
		vars[i] = p
	}
	return this.performUpdates(query,
		func(entity interface{}) ([]interface{}, error) {
			wwp := entity.(WhiteWaterPoint)
			pathBytes, err := json.Marshal(geo.NewGeoPoint(wwp.Point))
			if err != nil {
				return nil, err
			}
			cat, err := wwp.Category.MarshalJSON()
			if err != nil {
				return nil, err
			}
			params := []interface{}{nullIf0(wwp.Id), wwp.Title, cat, string(pathBytes), wwp.ShortDesc, wwp.Link, nullIf0(wwp.RiverId)}
			fmt.Println(params)
			return params, nil
		}, vars...)
}

