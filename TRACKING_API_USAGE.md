# Container Tracking API Usage

## Endpoint

**GET** `/api/checkout/track`

## Description

Tracks a container by Container number, Bill of Lading (BL), or Booking number. Returns the current location and estimated time to reach the destination.

## Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `number` | string | **Yes** | - | Container number, Bill of Lading, or Booking number |
| `sealine` | string | No | `auto` | Standard Carrier Alpha Code (SCAC). Use `auto` to auto-detect |
| `type` | string | No | `auto` | Type of number: `CT` (Container), `BL` (Bill of Lading), `BK` (Booking) |
| `force_update` | boolean | No | `false` | Get fresh data from shipping line (slower) |
| `route` | boolean | No | `true` | Include detailed route data |
| `ais` | boolean | No | `true` | Include AIS vessel position data (requires `route=true`) |

## Environment Variables

Add these to your `.env` file:

```env
TRACKING_API_KEY=your_api_key_here
TRACKING_API_BASE_URL=https://api.trackingapi.com
```

## Example Requests

### Track by Container Number

```bash
GET /api/checkout/track?number=ECMU7336714&type=CT&route=true&ais=true
```

### Track by Bill of Lading

```bash
GET /api/checkout/track?number=HKA2573372&type=BL&sealine=CMDU
```

### Track by Booking Number

```bash
GET /api/checkout/track?number=BK12345678&type=BK
```

### Auto-detect Type and Sealine

```bash
GET /api/checkout/track?number=ECMU7336714
```

## Example Response

```json
{
  "success": true,
  "message": "Container tracking information retrieved successfully",
  "metadata": {
    "blNumber": "HKA2573372",
    "sealine": "CMA CGM",
    "status": "IN_TRANSIT",
    "updatedAt": "2025-10-31 09:00:25"
  },
  "containers": [
    {
      "containerNumber": "ECMU7336714",
      "currentLocation": {
        "name": "Shanghai",
        "city": "Shanghai",
        "state": "Shanghai Shi",
        "country": "China",
        "countryCode": "CN",
        "coordinates": {
          "lat": 31.366365,
          "lng": 121.61475
        },
        "facility": "YANGSHAN DEEP WATER PORT PHASE1 TER"
      },
      "status": "IN_TRANSIT",
      "statusMessage": "On vessel CMA CGM SAMSON heading to San Antonio",
      "realTimePosition": {
        "lat": -31.238251,
        "lng": -80.020744,
        "updated_at": "2025-10-30 21:57:00"
      },
      "destination": {
        "name": "San Antonio",
        "city": "San Antonio",
        "state": "Region de Valparaiso",
        "country": "Chile",
        "countryCode": "CL",
        "coordinates": {
          "lat": -33.59473,
          "lng": -71.60746
        }
      },
      "estimatedArrival": "2025-10-31 23:00:00",
      "daysUntilArrival": 1,
      "isActualArrival": false,
      "currentEvent": {
        "description": "Vessel Departure",
        "eventType": "TRANSPORT",
        "eventCode": "DEPA",
        "date": "2025-10-08 04:30:00",
        "transportType": "VESSEL",
        "vessel": {
          "name": "CMA CGM SAMSON",
          "imo": 9436379,
          "voyage": "1MH08E1MA"
        }
      },
      "nextEvent": {
        "description": "Vessel Arrival",
        "location": "San Antonio",
        "date": "2025-10-31 23:00:00",
        "eventType": "TRANSPORT"
      },
      "vessel": {
        "name": "CMA CGM SAMSON",
        "imo": 9436379,
        "voyage": "1MH08E1MA"
      }
    }
  ],
  "summary": {
    "totalContainers": 1,
    "currentStatus": "IN_TRANSIT",
    "origin": {
      "name": "Shekou",
      "country": "China",
      "date": "2025-09-30 03:32:00"
    },
    "destination": {
      "name": "San Antonio",
      "country": "Chile",
      "estimatedArrival": "2025-10-31 23:00:00",
      "isActual": false
    }
  }
}
```

## Response Fields

### Container Object

- `containerNumber`: Container number
- `currentLocation`: Current location details (name, city, state, country, coordinates, facility)
- `status`: Overall container status (IN_TRANSIT, DELIVERED, etc.)
- `statusMessage`: Human-readable status message
- `realTimePosition`: GPS coordinates if container is on a vessel (from AIS)
- `destination`: Destination port details
- `estimatedArrival`: Estimated arrival date/time at destination
- `daysUntilArrival`: Number of days until arrival (calculated)
- `isActualArrival`: Whether the arrival date is actual (true) or estimated (false)
- `currentEvent`: Last actual event that occurred
- `nextEvent`: Next predicted event
- `vessel`: Current vessel information (if on vessel)

### Summary Object

- `totalContainers`: Number of containers in the shipment
- `currentStatus`: Overall shipment status
- `origin`: Origin port information
- `destination`: Destination port information

## Error Responses

### Missing Number

```json
{
  "success": false,
  "message": "Container/BL/Booking number is required"
}
```

### API Key Not Configured

```json
{
  "success": false,
  "message": "Tracking API key not configured"
}
```

### API Error

```json
{
  "success": false,
  "message": "Failed to fetch tracking information",
  "error": { ... }
}
```

## JavaScript Example

```javascript
// Track container
async function trackContainer(containerNumber) {
  try {
    const response = await fetch(
      `/api/checkout/track?number=${containerNumber}&route=true&ais=true`
    );
    const data = await response.json();
    
    if (data.success) {
      data.containers.forEach(container => {
        console.log(`Container: ${container.containerNumber}`);
        console.log(`Current Location: ${container.currentLocation.name}, ${container.currentLocation.country}`);
        console.log(`Status: ${container.statusMessage}`);
        console.log(`Days until arrival: ${container.daysUntilArrival}`);
        console.log(`Estimated arrival: ${container.estimatedArrival}`);
        
        if (container.realTimePosition) {
          console.log(`Real-time position: ${container.realTimePosition.lat}, ${container.realTimePosition.lng}`);
        }
      });
    }
  } catch (error) {
    console.error('Tracking error:', error);
  }
}

// Usage
trackContainer('ECMU7336714');
```

## cURL Example

```bash
curl -X GET "http://localhost:8000/api/checkout/track?number=ECMU7336714&type=CT&route=true&ais=true" \
  -H "Content-Type: application/json"
```

## Notes

- The API automatically detects the number type and sealine if not specified
- Setting `route=true` and `ais=true` provides the most detailed information including real-time vessel positions
- `force_update=true` fetches fresh data but may take longer
- The `daysUntilArrival` is calculated from the current date to the estimated arrival date
- Real-time position is only available when the container is on a vessel and AIS data is enabled

