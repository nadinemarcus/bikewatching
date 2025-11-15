// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken =
    'pk.eyJ1IjoibmVtYXJjdXMiLCJhIjoiY21odXl2Y2p3MDU3ejJtcHFsd25hOXNmNyJ9.rUGMxR1SwE1_ZkX7HFeqfA';

// ------------------------------------------------------
// IMPORTANT: Declare trip arrays OUTSIDE load event
// ------------------------------------------------------
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

// Format helpers
function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function filterByMinute(tripsByMinute, minute) {
    if (minute === -1) return tripsByMinute.flat();

    let minMinute = (minute - 60 + 1440) % 1440;
    let maxMinute = (minute + 60) % 1440;

    if (minMinute > maxMinute) {
        return tripsByMinute.slice(minMinute).concat(tripsByMinute.slice(0, maxMinute)).flat();
    } else {
        return tripsByMinute.slice(minMinute, maxMinute).flat();
    }
}

// Compute station traffic
function computeStationTraffic(stations, timeFilter = -1) {
    const dep = d3.rollup(
        filterByMinute(departuresByMinute, timeFilter),
        v => v.length,
        d => d.start_station_id
    );

    const arr = d3.rollup(
        filterByMinute(arrivalsByMinute, timeFilter),
        v => v.length,
        d => d.end_station_id
    );

    return stations.map(st => {
        const id = st.short_name;
        st.departures = dep.get(id) ?? 0;
        st.arrivals = arr.get(id) ?? 0;
        st.totalTraffic = st.departures + st.arrivals;
        return st;
    });
}

// ------------------------------------------------------
// MAP
// ------------------------------------------------------
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12
});

map.on('load', async () => {

    // Load JSON + CSV
    const stationsJson = await d3.json(
        'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
    );

    const trips = await d3.csv(
        'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
        trip => {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);

            const m = minutesSinceMidnight(trip.started_at);
            departuresByMinute[m].push(trip);
            arrivalsByMinute[m].push(trip);

            return trip;
        }
    );

    let stations = computeStationTraffic(stationsJson.data.stations);

    // SVG overlay
    const svg = d3
        .select('#map')
        .append('svg')
        .style('position', 'absolute')
        .style('top', 0)
        .style('left', 0)
        .style('width', '100%')
        .style('height', '100%')
        .style('pointer-events', 'none');

    function getCoords(st) {
        const pt = map.project([+st.lon, +st.lat]);
        return { cx: pt.x, cy: pt.y };
    }

    const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, d => d.totalTraffic)])
        .range([5, 25]);

    let circles = svg
        .selectAll('circle')
        .data(stations, d => d.short_name)
        .enter()
        .append('circle')
        .style("--departure-ratio", d =>
            d.totalTraffic === 0 ? 0.5 : d.departures / d.totalTraffic
        )
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('opacity', 0.8);

    function updatePositions() {
        circles
            .attr('cx', d => getCoords(d).cx)
            .attr('cy', d => getCoords(d).cy);
    }
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    updatePositions();

    // ------------------------------------------------------
    // SLIDER
    // ------------------------------------------------------

    const selectedTime = document.getElementById("selected-time");
    const anyTimeLabel = document.getElementById("any-time-label");
    const slider = document.getElementById('time-slider');

    function formatTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return new Date(0, 0, 0, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }

    function updateTimeDisplay() {
        const t = Number(slider.value);

        if (t === -1) {
            selectedTime.textContent = "";
            anyTimeLabel.style.display = "block";
        } else {
            selectedTime.textContent = formatTime(t);
            anyTimeLabel.style.display = "none";
        }
    }

    slider.addEventListener("input", () => {
        const t = Number(slider.value);

        updateTimeDisplay();

        stations = computeStationTraffic(stationsJson.data.stations, t);

        circles
            .data(stations, d => d.short_name)
            .attr("r", d => radiusScale(d.totalTraffic))
            .style("--departure-ratio", d =>
                d.totalTraffic === 0 ? 0.5 : d.departures / d.totalTraffic
            );
    });

    updateTimeDisplay();
});
