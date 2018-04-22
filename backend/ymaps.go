package main

import (
	. "github.com/and-hom/wwmap/backend/dao"
	. "github.com/and-hom/wwmap/backend/geo"
	"fmt"
	"math"
)

func toYmapsPreset(epType EventPointType) string {
	switch epType {
	case PHOTO:
		return "islands#blueVegetationIcon";
	case VIDEO:
		return "islands#blueVideoIcon";
	case POST:
		return "islands#blueBookIcon";
	}
	return "islands#blueDotIcon";
}

func routeToYmaps(route Route) []Feature {
	pointCount := len(route.Points)
	trackCount := len(route.Tracks)
	featureCount := pointCount + trackCount
	result := make([]Feature, featureCount)

	var i = 0;
	for ; i < pointCount; i++ {
		point := route.Points[i]
		result[i] = Feature{
			Id:point.Id,
			Geometry:NewGeoPoint(point.Point),
			Type: FEATURE,
			Properties:FeatureProperties{
				HintContent: point.Title,
				Id: point.Id,
			},
			Options:FeatureOptions{
				Preset: toYmapsPreset(point.Type),
				Id: point.Id,
			},
		}
	}
	for ; i < featureCount; i++ {
		track := route.Tracks[i - pointCount]
		result[i] = Feature{
			Id:track.Id,
			Geometry:NewLineString(track.Path),
			Type: FEATURE,
		}
	}

	return result
}

func tracksToYmaps(tracks []Track) []Feature {
	tLen := len(tracks)

	result := make([]Feature, tLen)
	for i := 0; i < tLen; i++ {
		track := tracks[i]
		result[i] = Feature{
			Id:track.Id,
			Geometry:NewLineString(track.Path),
			Type: FEATURE,
		}
	}
	return result
}

func pointsToYmaps(points []EventPoint) []Feature {
	pLength := len(points)

	result := make([]Feature, pLength)
	for i := 0; i < pLength; i++ {
		point := points[i]
		result[i] = Feature{
			Id:point.Id,
			Geometry:NewGeoPoint(point.Point),
			Type: FEATURE,
			Properties:FeatureProperties{
				HintContent: point.Title,
				Id: point.Id,
			},
			Options:FeatureOptions{
				Preset: toYmapsPreset(point.Type),
				Id: point.Id,
			},
		}
	}

	return result
}


func mkFeature(point WhiteWaterPoint) Feature {
	return Feature{
		Id:point.Id,
		Geometry:NewGeoPoint(point.Point),
		Type: FEATURE,
		Properties:FeatureProperties{
			HintContent: point.Title,
			Id: point.Id,

			Title: point.Title,
			Category: point.Category,
			Link: point.Link,
			ShortDesc: point.ShortDesc,
		},
		Options:FeatureOptions{
			IconLayout: IMAGE,
			IconImageHref: fmt.Sprintf("img/cat%d.png", point.Category.Category),
			IconImageSize: []int{32, 32},
			IconImageOffset: []int{-16, -16},

			Id: point.Id,
		},
	}
}

func ClusterGeom(points []WhiteWaterPoint) (Point, Bbox) {
	var minLat = math.MaxFloat64
	var minLon = math.MaxFloat64
	var maxLat = - math.MaxFloat64
	var maxLon = - math.MaxFloat64
	var latSum = float64(0)
	var lonSum = float64(0)
	for i := 0; i < len(points); i++ {
		lat := points[i].Point.Lat
		lon := points[i].Point.Lon

		minLat = math.Min(minLat, lat)
		minLon = math.Min(minLon, lon)
		maxLat = math.Max(maxLat, lat)
		maxLon = math.Max(maxLon, lon)

		latSum += lat
		lonSum += lon
	}
	return Point{
		Lat: latSum / float64(len(points)),
		Lon: lonSum / float64(len(points)),
	}, Bbox{
		X1:minLon,
		Y1: minLat,
		X2:maxLon,
		Y2:maxLat,
	}
}

func mkCluster(Id ClusterId, points []WhiteWaterPoint) Feature {
	center, bounds := ClusterGeom(points)
	features := make([]Feature, len(points))

	for i := 0; i < len(points); i++ {
		features[i] = mkFeature(points[i])
	}

	return Feature{
		Type: CLUSTER,
		Geometry:NewGeoPoint(center),
		Bbox: bounds,
		Number: len(points),
		Features: features,
		Properties:FeatureProperties{
			HintContent: Id.Title,

			Title: Id.Title,
		},
		//Options:FeatureOptions{
		//	IconLayout: IMAGE,
		//	IconImageHref: fmt.Sprintf("img/cat%d.png", point.Category.Category),
		//	IconImageSize: []int{32, 32},
		//	IconImageOffset: []int{-16, -16},
		//
		//	Id: point.Id,
		//},
	}
}

func whiteWaterPointsToYmaps(points []WhiteWaterPoint, width float64, height float64) []Feature {
	by_cluster := clusterizePoints(points, width, height)

	result := make([]Feature, 0)
	for id, cluste_points := range by_cluster {
		if len(cluste_points) == 1 {
			result = append(result, mkFeature(points[0]))
		} else {
			result = append(result, mkCluster(id, points))
		}
	}

	return result
}

func RoutesToYmaps(route []Route) FeatureCollection {
	var features = []Feature{}
	for i := 0; i < len(route); i++ {
		features = append(features, routeToYmaps(route[i])...)
	}
	return MkFeatureCollection(features)
}

