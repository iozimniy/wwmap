package dao

import (
	"fmt"
	"time"
	"math"
	. "github.com/and-hom/wwmap/backend/geo"
	"regexp"
	"strconv"
	"strings"
)

type JSONTime time.Time

func (t JSONTime)MarshalJSON() ([]byte, error) {
	//do your serializing here
	stamp := fmt.Sprintf("\"%s\"", time.Time(t).Format("2006-01-02"))
	return []byte(stamp), nil
}

type EventPointType string;

const (
	PHOTO EventPointType = "photo"
	VIDEO EventPointType = "video"
	POST EventPointType = "post"
)

var EventPointAvailableTypes []EventPointType = []EventPointType{PHOTO, VIDEO, POST}

func ParseEventPointType(s string) (EventPointType, error) {
	for _, t := range EventPointAvailableTypes {
		if s == string(t) {
			return t, nil
		}
	}
	return "", fmt.Errorf("Unsupported point type %s", s)
}

type EventPoint struct {
	Id      int64 `json:"id"`
	Type    EventPointType `json:"type"`
	Point   Point `json:"point"`
	Title   string `json:"title"`
	Content string `json:"content"`
	Time    JSONTime `json:"time"`
}

type TrackType string;

const (
	UNKNOWN TrackType = ""
	PEDESTRIAN TrackType = "pd"
	BIKE TrackType = "bk"
	WATER TrackType = "ww"
)

var TrackAvailableTypes []TrackType = []TrackType{PEDESTRIAN, BIKE, WATER, UNKNOWN}

func ParseTrackType(s string) (TrackType, error) {
	for _, t := range TrackAvailableTypes {
		if s == string(t) {
			return t, nil
		}
	}
	return "", fmt.Errorf("Unsupported track type %s", s)
}

type Track struct {
	Id        int64 `json:"id"`
	Title     string `json:"title"`
	Path      []Point `json:"path"`
	Length    float64 `json:"length"`
	Type      TrackType `json:"type"`
	StartTime JSONTime `json:"start"`
	EndTime   JSONTime `json:"end"`
}

func (this Track) Bounds() Bbox {
	if len(this.Path) == 0 {
		return Bbox{-180, -90, 180, 90}
	}
	var xMin float64 = 180
	var yMin float64 = 90
	var xMax float64 = -180
	var yMax float64 = -90

	for _, p := range this.Path {
		xMin = math.Min(xMin, p.Lat)
		yMin = math.Min(yMin, p.Lon)
		xMax = math.Max(xMax, p.Lat)
		yMax = math.Max(yMax, p.Lon)
	}

	return Bbox{
		X1:xMin,
		Y1:yMin,
		X2:xMax,
		Y2:yMax,
	}
}

type SportCategory struct {
	Category int
	Sub      string
}

func (this SportCategory) MarshalJSON() ([]byte, error) {
	return []byte(fmt.Sprintf("%d%s", this.Category, this.Sub)), nil
}

func (this *SportCategory) UnmarshalJSON(data []byte) error {
	dataStr := string(data)
	if len(strings.TrimSpace(dataStr)) == 0 {
		// no category specified
		return nil
	}

	re := regexp.MustCompile("^(\\d+)([A-Za-z]+)?$")
	var err error

	match := re.FindStringSubmatch(dataStr)
	if match == nil {
		return fmt.Errorf("Can not parse route category: %s", dataStr)
	}
	this.Category, err = strconv.Atoi(match[1])
	if err != nil {
		return err
	}
	if len(match) >= 3 {
		this.Sub = match[2]
	} else {
		this.Sub = ""
	}
	return nil
}

type Route struct {
	Id       int64 `json:"id"`
	Title    string `json:"title"`
	Tracks   []Track `json:"tracks"`
	Points   []EventPoint `json:"points"` // points with articles
	Category SportCategory `json:"category"`
}

func Bounds(tracks []Track, points []EventPoint) Bbox {
	var xMin float64 = 180
	var yMin float64 = 90
	var xMax float64 = -180
	var yMax float64 = -90

	for _, tr := range tracks {
		trackBounds := tr.Bounds()
		xMin = math.Min(xMin, trackBounds.X1)
		yMin = math.Min(yMin, trackBounds.Y1)
		xMax = math.Max(xMax, trackBounds.X2)
		yMax = math.Max(yMax, trackBounds.Y2)
	}
	for _, ep := range points {
		xMin = math.Min(xMin, ep.Point.Lat)
		yMin = math.Min(yMin, ep.Point.Lon)
		xMax = math.Max(xMax, ep.Point.Lat)
		yMax = math.Max(yMax, ep.Point.Lon)
	}

	return Bbox{
		X1:xMin,
		Y1:yMin,
		X2:xMax,
		Y2:yMax,
	}
}

type ExtDataTrack struct {
	Title   string `json:"title"`
	FileIds []string `json:"fileIds"`
}

type WaterWay struct {
	Id       int64 `json:"id"`
	Title    string `json:"title"`
	Type     string `json:"type"`
	Path     []Point `json:"path"`
	ParentId int64 `json:"parentId"`
	Comment  string `json:"comment"`
}

type WhiteWaterPoint struct {
	Id         int64 `json:"id"`
	WaterWayId int64 `json:"waterWayId"`
	Type       string `json:"type"`
	Category   SportCategory `json:"type"`
	Point      Point `json:"point"`
	Title      string `json:"title"`
	Comment    string `json:"comment"`
}
