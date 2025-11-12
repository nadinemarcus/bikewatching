// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoibmVtYXJjdXMiLCJhIjoiY21odXl2Y2p3MDU3ejJtcHFsd25hOXNmNyJ9.rUGMxR1SwE1_ZkX7HFeqfA';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/nemarcus/cmhuzt2tx00ef01ss2s2odxym',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18,
});

// Function to compute station traffic
function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id
    );
    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id
    );

    return stations.map((station) => {
        const id = station.short_name;
        station.departures = departures.get(id) ?? 0;
        station.arrivals = arrivals.get(id) ?? 0;
        station.totalTraffic = station.departures + station.arrivals;
        return station;
    });
}

map.on('load', async () => {
    // Add Boston bike lanes
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });
    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': '#86C5D8',
            'line-width': 5,
            'line-opacity': 0.6,
        },
    });

    // Add Cambridge bike lanes
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'cambridge_bikepaths.geojson',
    });
    map.addLayer({
        id: 'bike-lanes-v2',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': '#86C5D8',
            'line-width': 5,
            'line-opacity': 0.6,
        },
    });

    // Load data
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const csvurl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
    let jsonData, trips, stations;
    let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

    try {
        jsonData = await d3.json(jsonurl);
        trips = await d3.csv(csvurl, (trip) => {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
            return trip;
        });
        stations = computeStationTraffic(jsonData.data.stations, trips);
    } catch (error) {
        console.error('Error loading JSON or CSV:', error);
        return;
    }

    // Set up SVG overlay
    const svg = d3.select('#map').select('svg');

    function getCoords(station) {
        const point = new mapboxgl.LngLat(+station.lon, +station.lat);
        const { x, y } = map.project(point);
        return { cx: x, cy: y };
    }

    const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic)])
        .range([5, 25]);

    // Append circles
    const circles = svg
        .selectAll('circle')
        .data(stations, (d) => d.short_name)
        .enter()
        .append('circle')
        .attr('r', (d) => radiusScale(d.totalTraffic))
        .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.8)
        .each(function (d) {
            d3.select(this)
                .append('title')
                .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        })
        .style('--departure-ratio', (d) =>
            stationFlow(d.departures / (d.totalTraffic+0.001)),
        );

    function updatePositions() {
        circles
            .attr('cx', (d) => getCoords(d).cx)
            .attr('cy', (d) => getCoords(d).cy);
    }

    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);
    updatePositions();

    // Time filter elements
    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time-label');

    function formatTime(minutes) {
        const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
        return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
    }

    function minutesSinceMidnight(date) {
        return date.getHours() * 60 + date.getMinutes();
    }

    function filterTripsbyTime(trips, timeFilter) {
        return timeFilter === -1
            ? trips
            : trips.filter((trip) => {
                const startedMinutes = minutesSinceMidnight(trip.started_at);
                const endedMinutes = minutesSinceMidnight(trip.ended_at);
                return (
                    Math.abs(startedMinutes - timeFilter) <= 60 ||
                    Math.abs(endedMinutes - timeFilter) <= 60
                );
            });
    }

    function updateScatterPlot(timeFilter) {
        const filteredTrips = filterTripsbyTime(trips, timeFilter);
        const filteredStations = computeStationTraffic(stations, filteredTrips);

        circles
            .data(filteredStations, (d) => d.short_name)
            .attr('r', (d) => radiusScale(d.totalTraffic))
            .select('title')
            .text((d) => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`)
            .style('--departure-ratio', (d) =>
                stationFlow(d.departures / (d.totalTraffic+0.001)),
            );
    }

    function updateTimeDisplay() {
        const timeFilter = Number(timeSlider.value);
        if (timeFilter === -1) {
            selectedTime.textContent = '';
            anyTimeLabel.style.display = 'block';
        } else {
            selectedTime.textContent = formatTime(timeFilter);
            anyTimeLabel.style.display = 'none';
        }
        updateScatterPlot(timeFilter);
    }

    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();
});
