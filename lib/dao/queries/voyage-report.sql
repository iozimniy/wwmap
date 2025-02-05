--@upsert
INSERT INTO voyage_report(title, remote_id,source,url,date_published,date_modified,date_of_trip, tags, author)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (source, remote_id) DO UPDATE SET title=$1, url=$4, date_modified=$6, date_of_trip=$7, tags=$8, author=$9
RETURNING id
--@get-last-id
SELECT COALESCE(max(date_modified), to_timestamp(-65000000000)) FROM voyage_report WHERE source=$1
--@list
SELECT id,title,remote_id,source,url,date_published,date_modified,date_of_trip, tags, author FROM (
SELECT ROW_NUMBER() OVER (PARTITION BY source ORDER BY date_of_trip DESC, date_published DESC) AS r_num,
*
FROM voyage_report INNER JOIN voyage_report_river ON voyage_report.id = voyage_report_river.voyage_report_id
WHERE voyage_report_river.river_id = $1) sq WHERE r_num<=$2 ORDER BY source, date_of_trip DESC, date_published DESC
--@list-all
SELECT id,title,remote_id,source,url,date_published,date_modified,date_of_trip, tags, author FROM voyage_report WHERE source=$1
--@upsert-river-link
INSERT INTO voyage_report_river(voyage_report_id, river_id) VALUES($1,$2) ON CONFLICT DO NOTHING
--@delete-river-link
DELETE FROM voyage_report_river WHERE river_id=$1