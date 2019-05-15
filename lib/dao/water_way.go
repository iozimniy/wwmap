package dao

import (
	"database/sql"
	"encoding/json"
	log "github.com/Sirupsen/logrus"
	"github.com/and-hom/wwmap/lib/dao/queries"
	"github.com/and-hom/wwmap/lib/geo"
	"github.com/lib/pq"
	"strings"
)

func NewWaterWayPostgresDao(postgresStorage PostgresStorage) WaterWayDao {
	return waterWayStorage{
		PostgresStorage:     postgresStorage,
		insertQuery:         queries.SqlQuery("water-way", "insert"),
		updateQuery:         queries.SqlQuery("water-way", "update"),
		listQuery:           queries.SqlQuery("water-way", "list"),
		unlinkRiverQuery:    queries.SqlQuery("water-way", "unlink-river"),
		detectForRiverQuery: queries.SqlQuery("water-way", "detect-for-river"),
		bindToRiverQuery:    queries.SqlQuery("water-way", "bind-to-river"),
		listByRiverIdsQuery: queries.SqlQuery("water-way", "list-by-river-ids"),
		listByBboxQuery:     queries.SqlQuery("water-way", "list-by-bbox-simple"),
	}
}

type waterWayStorage struct {
	PostgresStorage
	insertQuery         string
	updateQuery         string
	listQuery           string
	unlinkRiverQuery    string
	detectForRiverQuery string
	bindToRiverQuery    string
	listByRiverIdsQuery string
	listByBboxQuery     string
}

func (this waterWayStorage) AddWaterWays(waterways ...WaterWay) error {
	vars := make([]interface{}, len(waterways))
	for i, p := range waterways {
		vars[i] = p
	}
	return this.performUpdates("",
		func(entity interface{}) ([]interface{}, error) {
			waterway := entity.(WaterWay)

			pathBytes, err := json.Marshal(geo.NewPgLineString(waterway.Path))
			if err != nil {
				return nil, err
			}
			return []interface{}{waterway.OsmId, waterway.Title, waterway.Type, waterway.Comment, string(pathBytes)}, nil
		}, vars...)
}

func (this waterWayStorage) UpdateWaterWay(waterway WaterWay) error {
	return this.performUpdates("",
		func(entity interface{}) ([]interface{}, error) {
			waterway := entity.(WaterWay)

			pathBytes, err := json.Marshal(geo.NewPgLineString(waterway.Path))
			if err != nil {
				return nil, err
			}
			return []interface{}{string(pathBytes), waterway.OsmId}, nil
		}, waterway)
}

func (this waterWayStorage) ForEachWaterWay(transformer func(WaterWay) (WaterWay, error), tmpTable string) error {
	rows, err := this.db.Query("")
	if err != nil {
		return err
	}
	defer rows.Close()

	tx, err := this.db.Begin()
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare("INSERT INTO " + tmpTable + "(id, osm_id, river_Id, title, type, comment, path) VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromGeoJSON($7))")
	if err != nil {
		return err
	}
	defer stmt.Close()

	i := 0
	for rows.Next() {
		waterWay, err := scanWaterWay(rows)
		if err != nil {
			return err
		}
		waterWayNew, err := transformer(waterWay)
		if err != nil {
			log.Errorf("Can not transofrm waterway %d: %v", waterWay.Id, err)
			return err
		}

		pathBytesNew, err := json.Marshal(geo.NewPgLineString(waterWayNew.Path))
		if err != nil {
			log.Errorf("Can not serialize path %v: %v", waterWayNew.Path, err)
			return err
		}
		riverIdNew := sql.NullInt64{
			Valid: waterWayNew.RiverId > 0,
			Int64: waterWayNew.RiverId,
		}
		stmt.Exec(waterWayNew.Id, waterWayNew.OsmId, riverIdNew, waterWayNew.Title, waterWayNew.Type, waterWayNew.Comment, string(pathBytesNew))
		i++
		if i%1000 == 0 {
			//	err := tx.Commit()
			//	if err != nil {
			//		log.Errorf("Can not commit: %v", err)
			//		return err
			//	}
			log.Info("Progress: ", i)
		}
	}
	tx.Commit()
	return nil
}

func scanWaterWay(rows *sql.Rows) (WaterWay, error) {
	waterWay := WaterWay{}
	osmId := sql.NullInt64{}
	riverId := sql.NullInt64{}
	pathStr := ""
	err := rows.Scan(&waterWay.Id, &osmId, &riverId, &waterWay.Title, &waterWay.Type, &waterWay.Comment, &pathStr)
	if err != nil {
		return WaterWay{}, err
	}
	if osmId.Valid {
		waterWay.OsmId = osmId.Int64
	}
	if riverId.Valid {
		waterWay.RiverId = riverId.Int64
	}
	var path geo.LineString
	err = json.Unmarshal([]byte(pathStr), &path)
	if err != nil {
		log.Errorf("Can not parse path \"%s\": %v", pathStr, err)
		return WaterWay{}, err
	}
	waterWay.Path = path.GetFlippedPath()

	return waterWay, nil
}

func scanWaterWaySimpleNonFlipped(rows *sql.Rows) (WaterWaySimple, error) {
	waterWay := WaterWaySimple{}
	pathStr := ""
	err := rows.Scan(&waterWay.Id, &pathStr)
	if err != nil {
		return WaterWaySimple{}, err
	}
	var path geo.LineString
	err = json.Unmarshal([]byte(pathStr), &path)
	if err != nil {
		log.Errorf("Can not parse path \"%s\": %v", pathStr, err)
		return WaterWaySimple{}, err
	}
	waterWay.Path = path.Coordinates
	return waterWay, nil
}

func (this waterWayStorage) UnlinkRiver(id int64, tx interface{}) error {
	return this.performUpdatesWithinTxOptionally(tx, this.unlinkRiverQuery, IdMapper, id)
}

const DETECTION_MIN_DISTANCE_METERS = 30

func (this waterWayStorage) DetectForRiver(riverId int64) ([]WaterWay, error) {
	log.Debug(this.detectForRiverQuery)
	result, err := this.doFindList(this.detectForRiverQuery, scanWaterWay, riverId, DETECTION_MIN_DISTANCE_METERS)
	if err != nil {
		return []WaterWay{}, err
	}
	return result.([]WaterWay), err
}

func (this waterWayStorage) BindToRiver(riverId int64, titleVariants []string) ([]int64, error) {
	titleVariantsLower := make([]string, len(titleVariants))
	for i := 0; i < len(titleVariants); i++ {
		titleVariantsLower[i] = strings.ToLower(titleVariants[i])
	}
	return this.updateReturningId(this.bindToRiverQuery, ArrayMapper, false,
		riverId, pq.Array(titleVariantsLower), DETECTION_MIN_DISTANCE_METERS)
}

func (this waterWayStorage) ListByRiverIds(riverIds ...int64) ([]WaterWay, error) {
	result, err := this.doFindList(this.listByRiverIdsQuery, scanWaterWay, pq.Array(riverIds))
	if err != nil {
		return []WaterWay{}, err
	}
	return result.([]WaterWay), err
}

func (this waterWayStorage) ListByBboxNonFilpped(bbox geo.Bbox) ([]WaterWaySimple, error) {
	result, err := this.doFindList(this.listByBboxQuery, scanWaterWaySimpleNonFlipped, bbox.Y1, bbox.X1, bbox.Y2, bbox.X2)
	if err != nil {
		return []WaterWaySimple{}, err
	}
	return result.([]WaterWaySimple), err
}
