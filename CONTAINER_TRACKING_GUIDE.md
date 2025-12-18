# Container Tracking API Guide

## Understanding the Tracking API Response

The tracking API returns comprehensive data about container shipments. Here's how to read it:

### Key Data Structures

#### 1. **Current Location** (Where the container is NOW)

The container's current location is determined by:
- Finding the **last event** in `containers[].events[]` where `actual === true`
- This event's `location` ID maps to the `locations[]` array
- The `transport_type` field tells you if it's on a vessel or truck

**Example from your data:**
```json
{
  "order_id": 9,
  "location": 1,  // Maps to locations[0] = "San Antonio, Chile"
  "description": "Vessel Arrival",
  "actual": true,  // This is the current location
  "transport_type": "VESSEL"
}
```

#### 2. **Real-Time Vessel Position** (GPS coordinates)

If the container is on a vessel, check:
```json
route_data.ais.last_vessel_position: {
  "lat": -31.238251,
  "lng": -80.020744,
  "updated_at": "2025-10-30 21:57:00"
}
```

This shows the vessel's current GPS position updated in real-time via AIS (Automatic Identification System).

#### 3. **Status Indicators**

- `metadata.status`: Overall shipment status (`IN_TRANSIT`, `DELIVERED`, etc.)
- `containers[].status`: Individual container status
- `events[].status`: Event-specific codes:
  - `CPS`: Container Picked-up at Station
  - `CGI`: Container Gate In
  - `CLL`: Container Loaded on Vessel
  - `VDL`: Vessel Departure from Loading port
  - `VAT`: Vessel Arrival at Transhipment
  - `CDT`: Container Discharged in Transhipment
  - `CLT`: Container Loaded in Transhipment
  - `VDT`: Vessel Departure from Transhipment
  - `VAD`: Vessel Arrival at Discharge port

#### 4. **Upcoming Events** (Predictions)

Events with `actual === false` are predicted/future events:
```json
{
  "order_id": 9,
  "description": "Vessel Arrival",
  "date": "2025-10-31 23:00:00",
  "actual": false,  // This is a prediction
  "location": 1  // Expected to arrive at San Antonio
}
```

#### 5. **Route Information**

- `route.pol`: Port of Loading (origin)
  - `location`: Location ID
  - `date`: Departure date
  - `actual`: true if actual, false if estimated
  
- `route.pod`: Port of Discharge (destination)
  - `location`: Location ID
  - `date`: Arrival date
  - `actual`: true if actual, false if estimated (ETA)

## Using the Parsing Function

### Option 1: Use the API Endpoint

**POST** `/api/checkout/track-container`

**Request Body:**
```json
{
  "trackingData": {
    "status": "success",
    "data": {
      // ... full tracking API response
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "metadata": {
      "blNumber": "HKA2573372",
      "sealine": "CMA CGM",
      "status": "IN_TRANSIT"
    },
    "containers": [
      {
        "containerNumber": "ECMU7336714",
        "currentLocation": {
          "name": "San Antonio",
          "country": "Chile",
          "coordinates": {
            "lat": -33.59473,
            "lng": -71.60746
          }
        },
        "statusMessage": "On vessel CMA CGM SAMSON heading to San Antonio",
        "currentEvent": {
          "description": "Vessel Arrival",
          "date": "2025-10-31 23:00:00",
          "transportType": "VESSEL",
          "vessel": {
            "name": "CMA CGM SAMSON",
            "imo": 9436379,
            "voyage": "1MH09W1MA"
          }
        },
        "realTimePosition": {
          "lat": -31.238251,
          "lng": -80.020744,
          "updated_at": "2025-10-30 21:57:00"
        },
        "nextEvent": {
          "description": "Container Discharge",
          "location": "San Antonio",
          "date": "2025-11-01 08:00:00"
        },
        "allEvents": [...]
      }
    ]
  }
}
```

### Option 2: Use the Function Directly

```javascript
const { parseContainerTracking } = require('./controllers/checkoutController');

// After calling your tracking API
const trackingApiResponse = await axios.get('your-tracking-api-url');
const parsedData = parseContainerTracking(trackingApiResponse.data);

// Access current location
parsedData.containers.forEach(container => {
  console.log(`Container ${container.containerNumber}:`);
  console.log(`Current Location: ${container.currentLocation.name}, ${container.currentLocation.country}`);
  console.log(`Status: ${container.statusMessage}`);
  
  if (container.realTimePosition) {
    console.log(`Real-time Position: ${container.realTimePosition.lat}, ${container.realTimePosition.lng}`);
  }
  
  if (container.nextEvent) {
    console.log(`Next Event: ${container.nextEvent.description} at ${container.nextEvent.location} on ${container.nextEvent.date}`);
  }
});
```

## Example: Determining Current Location

Based on your API response:

1. **Container ECMU7336714**:
   - Last actual event: Order ID 9 - "Vessel Arrival" at location 1 (San Antonio, Chile)
   - Date: 2025-10-31 23:00:00
   - **BUT** `actual: false` - This is predicted!
   - So the actual current location is Order ID 8 - "Vessel Departure" from location 2 (Shanghai, China)
   - **Current Status**: Container is on vessel "CMA CGM SAMSON" en route from Shanghai to San Antonio
   - **Real-time Position**: lat: -31.238251, lng: -80.020744 (somewhere in the Pacific Ocean)

2. **Container CMAU8661125**:
   - Same situation - on the same vessel heading to San Antonio

## Key Points

- **Always check `actual` field**: Events with `actual: false` are predictions, not current status
- **Use AIS data for real-time**: When `transport_type === "VESSEL"`, use `route_data.ais.last_vessel_position` for current GPS coordinates
- **Location IDs are references**: Use the `location` ID from events to look up full details in the `locations[]` array
- **Events are chronological**: `order_id` determines the sequence of events

## Displaying to Users

For a user-friendly display:

1. **Current Status**: Show `statusMessage` from parsed data
2. **Map View**: Use `realTimePosition` coordinates if available, otherwise use `currentLocation.coordinates`
3. **Timeline**: Show all events from `allEvents` array
4. **Next Step**: Highlight `nextEvent` if available
5. **Route**: Show origin (`route.pol`) and destination (`route.pod`)

