package dao

import (
log "github.com/Sirupsen/logrus"
"database/sql"
"encoding/json"
"github.com/and-hom/wwmap/lib/geo"
	"github.com/and-hom/wwmap/lib/model"
)

type WhiteWaterStorage struct {
	PostgresStorage
}

func (this WhiteWaterStorage) ListWhiteWaterPoints(bbox geo.Bbox) ([]WhiteWaterPointWithRiverTitle, error) {
	return this.listWhiteWaterPoints("WHERE point && ST_MakeEnvelope($1,$2,$3,$4)", bbox.X1, bbox.Y1, bbox.X2, bbox.Y2)
}
func (this WhiteWaterStorage) ListWhiteWaterPointsByRiver(id int64) ([]WhiteWaterPointWithRiverTitle, error) {
	return this.listWhiteWaterPoints("WHERE river_id=$1", id)
}

func (this WhiteWaterStorage) listWhiteWaterPoints(condition string, vars ...interface{}) ([]WhiteWaterPointWithRiverTitle, error) {
	result, err := this.doFindList(
		"SELECT white_water_rapid.id AS id, osm_id, river_id, river.title as river_title, type, white_water_rapid.title AS title, comment, ST_AsGeoJSON(point) as point, category, short_description, link " +
			"FROM white_water_rapid LEFT OUTER JOIN river ON white_water_rapid.river_id=river.id " + condition,
		func(rows *sql.Rows) (WhiteWaterPointWithRiverTitle, error) {
			var err error
			id := int64(-1)
			osmId := sql.NullInt64{}
			riverId := sql.NullInt64{}
			_type := ""
			title := ""
			comment := ""
			pointStr := ""
			categoryStr := ""
			shortDesc := sql.NullString{}
			link := sql.NullString{}
			riverTitle := sql.NullString{}
			err = rows.Scan(&id, &osmId, &riverId, &riverTitle, &_type, &title, &comment, &pointStr, &categoryStr, &shortDesc, &link)
			if err != nil {
				log.Errorf("Can not read from db: %v", err)
				return WhiteWaterPointWithRiverTitle{}, err
			}

			var pgPoint PgPoint
			err = json.Unmarshal([]byte(pointStr), &pgPoint)
			if err != nil {
				log.Errorf("Can not parse point %s for white water object %d: %v", pointStr, id, err)
				return WhiteWaterPointWithRiverTitle{}, err
			}

			var category model.SportCategory
			err = json.Unmarshal([]byte(categoryStr), &category)
			if err != nil {
				log.Errorf("Can not parse category %s for white water object %d: %v", categoryStr, id, err)
				return WhiteWaterPointWithRiverTitle{}, err
			}

			whiteWaterPoint := WhiteWaterPointWithRiverTitle{
				WhiteWaterPoint{
					Id:id,
					OsmId:getOrElse(osmId, -1),
					RiverId:getOrElse(riverId, -1),
					Title: title,
					Type: _type,
					Point: pgPoint.Coordinates,
					Comment: comment,
					Category: category,
					ShortDesc: shortDesc.String,
					Link: link.String,
				},
				riverTitle.String,
			}
			return whiteWaterPoint, nil
		}, vars...)
	if (err != nil ) {
		return []WhiteWaterPointWithRiverTitle{}, err
	}
	return result.([]WhiteWaterPointWithRiverTitle), nil
}
