// Utility to convert text location to coordinates using Nominatim Open API
async function geocode(locationText) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationText)}&format=json&limit=1`, {
      headers: {
        'User-Agent': 'TrackSyncApp/1.0 (test@tracksync.local)'
      }
    });
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].name };
    }
  } catch (err) {
    console.error(`Geocode error for ${locationText}:`, err.message);
  }
  return null;
}

// Utility to get routing path using OSRM
async function getRoute(srcCoord, destCoord) {
  try {
    const url = `http://router.project-osrm.org/route/v1/driving/${srcCoord.lon},${srcCoord.lat};${destCoord.lon},${destCoord.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data.routes && data.routes.length > 0) {
      return data.routes[0].geometry.coordinates; // Array of [lon, lat]
    }
  } catch (err) {
    console.error("OSRM Route error:", err.message);
  }
  return null;
}

// Haversine formula to calculate distance between two coordinates
function getDistance(coord1, coord2) {
  const R = 6371; // km
  const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
  const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

class RouteService {
  /**
   * Plans a route from source to destination.
   * Finds intermediate points (hubs) along the real highway path.
   */
  static async planRoute(source, destination, numIntermediateHubs = 3) {
    const src = await geocode(source);
    const dest = await geocode(destination);
    
    // Fallback coordinates if API fails
    if (!src || !dest) {
      console.warn("Geocoding failed. Falling back to default mock hubs.");
      return null; 
    }

    const routeCoords = await getRoute(src, dest);
    
    let stages = [];
    stages.push({ name: `Manufacturer (${src.name})`, hub: null, lat: src.lat, lng: src.lon });

    if (routeCoords && routeCoords.length > 0) {
      // routeCoords is array of [lon, lat]
      const totalPoints = routeCoords.length;
      
      // Select intermediate points roughly evenly spaced by array index
      // (For a hackathon, array index spacing is sufficient vs exact physical distance interpolation)
      for (let i = 1; i <= numIntermediateHubs; i++) {
        const index = Math.floor((totalPoints / (numIntermediateHubs + 1)) * i);
        const pt = routeCoords[index];
        stages.push({
          name: `Transit Checkpoint ${i}`,
          hub: `Dynamic_Hub_${i}`,
          lat: pt[1],
          lng: pt[0]
        });
      }
    } else {
      // Fallback straight line hubs
      for (let i = 1; i <= numIntermediateHubs; i++) {
        const fraction = i / (numIntermediateHubs + 1);
        const lat = src.lat + (dest.lat - src.lat) * fraction;
        const lon = src.lon + (dest.lon - src.lon) * fraction;
        stages.push({
          name: `Transit Checkpoint ${i}`,
          hub: `Dynamic_Hub_${i}`,
          lat,
          lng: lon
        });
      }
    }

    stages.push({ name: `Customer (${dest.name})`, hub: null, lat: dest.lat, lng: dest.lon });

    return {
      stages,
      routeGeoJSON: routeCoords ? JSON.stringify(routeCoords) : null
    };
  }
}

module.exports = RouteService;
