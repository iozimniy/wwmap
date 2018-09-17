package dao

import (
	log "github.com/Sirupsen/logrus"
	"database/sql"
	"encoding/json"
	"github.com/and-hom/wwmap/lib/geo"
	"fmt"
	"github.com/lib/pq"
	"github.com/and-hom/wwmap/lib/dao/queries"
	"reflect"
)

func NewRiverPostgresDao(postgresStorage PostgresStorage) RiverDao {
	return riverStorage{
		PostgresStorage: postgresStorage,
		PropsManager:PropertyManagerImpl{table:queries.SqlQuery("river", "table"), dao:&postgresStorage},
		findByTagsQuery: queries.SqlQuery("river", "find-by-tags"),
		nearestQuery: queries.SqlQuery("river", "nearest"),
		insideBoundsQuery: queries.SqlQuery("river", "inside-bounds"),
		byIdQuery:queries.SqlQuery("river", "by-id"),
		listByCountryQuery:queries.SqlQuery("river", "by-country"),
		listByCountryFullQuery:queries.SqlQuery("river", "by-country-full"),
		listByRegionQuery:queries.SqlQuery("river", "by-region"),
		listByRegionFullQuery:queries.SqlQuery("river", "by-region-full"),
		listByFirstLettersQuery:queries.SqlQuery("river", "by-first-letters"),
		insertQuery:queries.SqlQuery("river", "insert"),
		updateQuery:queries.SqlQuery("river", "update"),
		deleteQuery:queries.SqlQuery("river", "delete"),
	}
}

type riverStorage struct {
	PostgresStorage
	PropsManager            PropertyManager
	findByTagsQuery         string
	nearestQuery            string
	insideBoundsQuery       string
	byIdQuery               string
	listByCountryQuery      string
	listByCountryFullQuery  string
	listByRegionQuery       string
	listByRegionFullQuery   string
	listByFirstLettersQuery string
	insertQuery             string
	updateQuery             string
	deleteQuery             string
}

func (this riverStorage) FindTitles(titles []string) ([]RiverTitle, error) {
	return this.listRiverTitles(this.findByTagsQuery, pq.Array(titles))
}

func (this riverStorage) NearestRivers(point geo.Point, limit int) ([]RiverTitle, error) {
	pointBytes, err := json.Marshal(geo.NewGeoPoint(point))
	if err != nil {
		return []RiverTitle{}, err
	}
	return this.listRiverTitles(this.nearestQuery, string(pointBytes), limit)
}

func (this riverStorage) ListRiversWithBounds(bbox geo.Bbox, limit int) ([]RiverTitle, error) {
	return this.listRiverTitles(this.insideBoundsQuery, bbox.X1, bbox.Y1, bbox.X2, bbox.Y2, limit)
}

func (this riverStorage) Find(id int64) (River, error) {
	r, found, err := this.doFindAndReturn(this.byIdQuery, riverMapperFull, id)
	if err != nil {
		return River{}, err
	}
	if !found {
		return River{}, fmt.Errorf("River with id %d not found", id)
	}
	return r.(River), nil
}

func (this riverStorage) ListByCountry(countryId int64) ([]RiverTitle, error) {
	return this.listRiverTitles(this.listByCountryQuery, countryId)
}

func (this riverStorage) ListByCountryFull(countryId int64) ([]River, error) {
	found, err := this.doFindList(this.listByCountryFullQuery, riverMapperFull, countryId)
	if err != nil {
		return []River{}, err
	}
	return found.([]River), err
}

func (this riverStorage) ListByRegion(regionId int64) ([]RiverTitle, error) {
	return this.listRiverTitles(this.listByRegionQuery, regionId)
}

func (this riverStorage) ListByRegionFull(regionId int64) ([]River, error) {
	found, err := this.doFindList(this.listByRegionFullQuery, riverMapperFull, regionId)
	if err != nil {
		return []River{}, err
	}
	return found.([]River), err
}

func (this riverStorage) ListByFirstLetters(query string, limit int) ([]RiverTitle, error) {
	return this.listRiverTitles(this.listByFirstLettersQuery, query, limit)
}

func (this riverStorage) Insert(river River) (int64, error) {
	aliasesB, err := json.Marshal(river.Aliases)
	if err != nil {
		return 0, err
	}
	return this.insertReturningId(this.insertQuery, river.RegionId, river.Title, string(aliasesB), river.Description)
}

func (this riverStorage) Save(rivers ...River) error {
	vars := make([]interface{}, len(rivers))
	for i, p := range rivers {
		vars[i] = p
	}
	return this.performUpdates(this.updateQuery, func(entity interface{}) ([]interface{}, error) {
		_river := entity.(River)
		aliasesB, err := json.Marshal(_river.Aliases)
		if err != nil {
			return []interface{}{}, err
		}
		log.Info(_river.Description)
		log.Info(reflect.TypeOf(_river.Description))
		return []interface{}{_river.Id, _river.RegionId, _river.Title, string(aliasesB), _river.Description}, nil
	}, vars...)
}

func (this riverStorage) listRiverTitles(query string, queryParams ...interface{}) ([]RiverTitle, error) {
	result, err := this.doFindList(query,
		func(rows *sql.Rows) (RiverTitle, error) {
			riverTitle := RiverTitle{}
			boundsStr := sql.NullString{}
			aliases := sql.NullString{}
			err := rows.Scan(&riverTitle.Id, &riverTitle.RegionId, &riverTitle.Title, &boundsStr, &aliases)
			if err != nil {
				return RiverTitle{}, err
			}

			var pgRect PgPolygon
			if boundsStr.Valid {
				err = json.Unmarshal([]byte(boundsStr.String), &pgRect)
				if err != nil {
					var pgPoint PgPoint
					err = json.Unmarshal([]byte(boundsStr.String), &pgPoint)
					if err != nil {
						log.Warnf("Can not parse rect or point %s for white water object %d: %v", boundsStr.String, riverTitle.Id, err)
					}
					pgRect.Coordinates = [][]geo.Point{[]geo.Point{
						{
							Lat: pgPoint.Coordinates.Lat - 0.0001,
							Lon: pgPoint.Coordinates.Lon - 0.0001,
						},
						{
							Lat: pgPoint.Coordinates.Lat + 0.0001,
							Lon: pgPoint.Coordinates.Lon - 0.0001,
						},
						{
							Lat: pgPoint.Coordinates.Lat + 0.0001,
							Lon: pgPoint.Coordinates.Lon + 0.0001,
						},
						{
							Lat: pgPoint.Coordinates.Lat - 0.0001,
							Lon: pgPoint.Coordinates.Lon + 0.0001,
						},
					}, }
				}

				riverTitle.Bounds = geo.Bbox{
					X1:pgRect.Coordinates[0][0].Lon,
					Y1:pgRect.Coordinates[0][0].Lat,
					X2:pgRect.Coordinates[0][2].Lon,
					Y2:pgRect.Coordinates[0][2].Lat,
				}
			}

			if aliases.Valid {
				err = json.Unmarshal([]byte(aliases.String), &riverTitle.Aliases)
			}
			return riverTitle, err
		}, queryParams...)
	if (err != nil ) {
		return []RiverTitle{}, err
	}
	return result.([]RiverTitle), nil
}

func (this riverStorage) Remove(id int64, tx interface{}) error {
	log.Infof("Remove river %d", id)
	return this.performUpdatesWithinTxOptionally(tx, this.deleteQuery, idMapper, id)
}

func (this riverStorage) Props() PropertyManager {
	return this.PropsManager
}

func riverMapperFull(rows *sql.Rows) (River, error) {
	river := River{}
	boundsStr := sql.NullString{}
	aliases := sql.NullString{}
	err := rows.Scan(&river.Id, &river.RegionId, &river.Title, &boundsStr, &aliases, &river.Description)
	if err != nil {
		return river, err
	}
	if aliases.Valid {
		err = json.Unmarshal([]byte(aliases.String), &river.Aliases)
	}
	return river, err
}
