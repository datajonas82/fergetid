### Common Authorities
- **Møre og Romsdal fylkeskommune**
- **Vestland fylkeskommune**
- **Rogaland fylkeskommune**
- **Viken fylkeskommune**
- **Troms og Finnmark fylkeskommune**

---

# Entur API - JourneyPattern Data Reference

## 📋 Overview

`journeyPattern` represents the **specific route pattern** that a journey follows. It's the "template" or "skeleton" of how a journey moves from one stop to another, including the sequence of stops, direction, and route geometry.

## 🔍 What is JourneyPattern?

Think of `journeyPattern` as the **"route template"** that defines:
- **Which stops** the journey visits
- **In what order** the stops are visited
- **What direction** the journey travels (outbound/inbound)
- **The route geometry** (GPS coordinates of the path)

### Key Concepts:

1. **Line** = The ferry route (e.g., "Molde-Vestnes")
2. **JourneyPattern** = The specific pattern/direction (e.g., "Molde → Vestnes" or "Vestnes → Molde")
3. **ServiceJourney** = A specific journey following that pattern (e.g., "Molde → Vestnes at 14:30")

## 🔍 Available JourneyPattern Data Fields

### Basic JourneyPattern Information
```graphql
journeyPattern {
  id                    # Unique pattern identifier
  directionType         # OUTBOUND, INBOUND, etc.
  line {               # The line this pattern belongs to
    id
    name
    publicCode
    transportMode
    transportSubmode
    authority {
      id
      name
    }
    operator {
      id
      name
    }
  }
}
```

### Route Geometry & Path Information
```graphql
journeyPattern {
  pointsOnLink {        # GPS coordinates of the route
    length              # Route length in meters
    points              # Encoded polyline of GPS coordinates
  }
}
```

### Stop Sequence Information
```graphql
journeyPattern {
  stopPoints {          # All stops along this pattern
    id
    name
    latitude
    longitude
    transportMode
    transportSubmode
  }
}
```

### Timing & Schedule Information
```graphql
journeyPattern {
  serviceJourneys {     # All journeys following this pattern
    id
    journeyStatus
    operatingDay {
      date
    }
  }
}
```

## 🚢 Ferry JourneyPattern Examples

### Outbound Pattern (Molde → Vestnes)
```javascript
{
  id: "NSR:JourneyPattern:12345",
  directionType: "OUTBOUND",
  line: {
    id: "NSR:Line:67890",
    name: "Molde-Vestnes",
    transportMode: "WATER",
    transportSubmode: "localCarFerry",
    operator: {
      name: "Fjord1"
    }
  },
  stopPoints: [
    {
      id: "NSR:StopPlace:40439",
      name: "Molde ferjekai",
      latitude: 62.7372,
      longitude: 7.1607
    },
    {
      id: "NSR:StopPlace:39508", 
      name: "Furneset ferjekai",
      latitude: 62.6272,
      longitude: 7.0861
    }
  ],
  pointsOnLink: {
    length: 12500,  // 12.5 km
    points: "encoded_polyline_string..."
  }
}
```

### Inbound Pattern (Vestnes → Molde)
```javascript
{
  id: "NSR:JourneyPattern:12346",
  directionType: "INBOUND",
  line: {
    id: "NSR:Line:67890",
    name: "Molde-Vestnes",
    transportMode: "WATER",
    transportSubmode: "localCarFerry"
  },
  stopPoints: [
    {
      id: "NSR:StopPlace:39508",
      name: "Furneset ferjekai",
      latitude: 62.6272,
      longitude: 7.0861
    },
    {
      id: "NSR:StopPlace:40439",
      name: "Molde ferjekai", 
      latitude: 62.7372,
      longitude: 7.1607
    }
  ]
}
```

## 🎯 Direction Types

### Common Direction Types
- **`OUTBOUND`** - Journey from origin to destination
- **`INBOUND`** - Journey from destination back to origin
- **`CLOCKWISE`** - Circular route clockwise
- **`ANTICLOCKWISE`** - Circular route counter-clockwise
- **`UNKNOWN`** - Direction not specified

### Ferry-Specific Examples
```javascript
// Molde → Vestnes
directionType: "OUTBOUND"

// Vestnes → Molde  
directionType: "INBOUND"

// Circular island route
directionType: "CLOCKWISE"
```

## 🎯 Practical Use Cases for JourneyPattern

### 1. Get Route Geometry for Map Visualization
```javascript
const JOURNEY_PATTERN_QUERY = gql`
  query JourneyPattern($id: String!) {
    journeyPattern(id: $id) {
      id
      directionType
      pointsOnLink {
        length
        points
      }
      stopPoints {
        id
        name
        latitude
        longitude
      }
    }
  }
`;

// Decode polyline for map visualization
function decodePolyline(points) {
  // Use a polyline decoder library
  return polyline.decode(points);
}

// Usage
const routeCoordinates = decodePolyline(data.journeyPattern.pointsOnLink.points);
// Use with Google Maps, Leaflet, etc.
```

### 2. Get All Stops Along a Route
```javascript
const ROUTE_STOPS_QUERY = gql`
  query RouteStops($journeyPatternId: String!) {
    journeyPattern(id: $journeyPatternId) {
      stopPoints {
        id
        name
        latitude
        longitude
        transportMode
        transportSubmode
      }
    }
  }
`;

// Get all stops in order
const stops = data.journeyPattern.stopPoints;
console.log('Route stops:', stops.map(s => s.name));
```

### 3. Get JourneyPatterns for a Line
```javascript
const LINE_PATTERNS_QUERY = gql`
  query LinePatterns($lineId: String!) {
    line(id: $lineId) {
      id
      name
      journeyPatterns {
        id
        directionType
        stopPoints {
          id
          name
          latitude
          longitude
        }
      }
    }
  }
`;

// Get outbound and inbound patterns
const outboundPattern = data.line.journeyPatterns.find(p => p.directionType === 'OUTBOUND');
const inboundPattern = data.line.journeyPatterns.find(p => p.directionType === 'INBOUND');
```

### 4. Calculate Route Distance
```javascript
const routeDistance = data.journeyPattern.pointsOnLink.length;
console.log(`Route distance: ${routeDistance} meters`);
```

### 5. Get JourneyPattern from ServiceJourney
```javascript
const SERVICE_JOURNEY_PATTERN_QUERY = gql`
  query ServiceJourneyPattern($id: String!) {
    serviceJourney(id: $id) {
      id
      journeyPattern {
        id
        directionType
        line {
          id
          name
          operator {
            name
          }
        }
        stopPoints {
          id
          name
        }
      }
    }
  }
`;
```

## 📊 JourneyPattern Data Availability

| Field | Availability | Notes |
|-------|-------------|-------|
| `id` | High | Always available |
| `directionType` | High | Usually available |
| `line` | High | Always available |
| `stopPoints` | Medium | May be limited for some patterns |
| `pointsOnLink` | Medium | Not always available |
| `serviceJourneys` | Variable | Depends on schedule |

## 🔧 Implementation Tips

1. **Cache journeyPattern data** - Patterns don't change frequently
2. **Use `directionType`** to distinguish outbound/inbound journeys
3. **Check `pointsOnLink`** before using for map visualization
4. **Handle missing `stopPoints`** gracefully
5. **Use `line` information** for operator/authority details

## 📝 Example Queries

### Basic JourneyPattern Query
```graphql
query BasicJourneyPattern($id: String!) {
  journeyPattern(id: $id) {
    id
    directionType
    line {
      id
      name
      transportMode
      transportSubmode
    }
  }
}
```

### JourneyPattern with Route Information
```graphql
query JourneyPatternWithRoute($id: String!) {
  journeyPattern(id: $id) {
    id
    directionType
    line {
      id
      name
      operator {
        id
        name
      }
    }
    pointsOnLink {
      length
      points
    }
    stopPoints {
      id
      name
      latitude
      longitude
    }
  }
}
```

### All JourneyPatterns for a Line
```graphql
query LineJourneyPatterns($lineId: String!) {
  line(id: $lineId) {
    id
    name
    journeyPatterns {
      id
      directionType
      stopPoints {
        id
        name
        latitude
        longitude
      }
    }
  }
}
```

## 🚢 Ferry-Specific JourneyPattern Data

### Common Ferry JourneyPattern Characteristics
- **Two patterns per line**: Usually OUTBOUND and INBOUND
- **Simple stop sequences**: Often just 2 stops (origin and destination)
- **Route geometry**: May follow shipping lanes or fjord paths
- **Consistent timing**: Patterns usually follow regular schedules

### Ferry JourneyPattern Examples
```javascript
// Local car ferry pattern
{
  directionType: "OUTBOUND",
  stopPoints: [
    { name: "Molde ferjekai" },
    { name: "Furneset ferjekai" }
  ]
}

// Multi-stop ferry pattern  
{
  directionType: "CLOCKWISE",
  stopPoints: [
    { name: "Bergen ferjekai" },
    { name: "Stavanger ferjekai" },
    { name: "Kristiansand ferjekai" },
    { name: "Bergen ferjekai" }
  ]
}
```
