'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet's default icon path issues in Next.js
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

function MapBounds({ markers }: { markers: Array<{lat: number, lng: number}> }) {
  const map = useMap();
  
  useEffect(() => {
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, markers]);
  
  return null;
}

interface MapProps {
  plan: any;
  onMarkerClick?: (activityName: string) => void;
}

export default function MapComponent({ plan, onMarkerClick }: MapProps) {
  const [mounted, setMounted] = useState(false);
  const [routePath, setRoutePath] = useState<[number, number][]>([]);

  const activities = plan?.activities?.filter((a: any) => a.type === 'activity' && a.coordinates) || [];
  const markers = activities.map((a: any) => ({ lat: a.coordinates.lat, lng: a.coordinates.lng, name: a.name }));
  
  // Unique string representing the coordinates to avoid infinite fetch loops
  const markersKey = markers.map((m: any) => `${m.lat},${m.lng}`).join('|');

  useEffect(() => {
    setMounted(true);
  }, []);
  
  useEffect(() => {
    if (markers.length > 1) {
      const fetchRoute = async () => {
        try {
          // OSRM expects lng,lat
          const coords = markers.map((m: any) => `${m.lng},${m.lat}`).join(';');
          const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
          const data = await res.json();
          
          if (data.routes && data.routes.length > 0) {
            // GeoJSON coordinates are [lng, lat], Leaflet wants [lat, lng]
            const path = data.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
            setRoutePath(path);
          } else {
            setRoutePath(markers.map((m: any) => [m.lat, m.lng]));
          }
        } catch (error) {
          console.error("Failed to fetch route:", error);
          setRoutePath(markers.map((m: any) => [m.lat, m.lng]));
        }
      };
      fetchRoute();
    } else {
      setRoutePath([]);
    }
  }, [markersKey]);
  
  if (!mounted) return <div style={{height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888'}}>Loading Map...</div>;

  // Default center (e.g. Barcelona) if no markers
  const center: [number, number] = markers.length > 0 ? [markers[0].lat, markers[0].lng] : [41.3874, 2.1686];

  return (
    <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%', zIndex: 1 }}>
      {/* Light theme tile layer from CartoDB Voyager */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      {routePath.length > 1 && (
        <Polyline positions={routePath} color="#0891b2" weight={4} opacity={0.85} />
      )}
      {activities.map((item: any, idx: number) => (
        <Marker 
          key={idx} 
          position={[item.coordinates.lat, item.coordinates.lng]}
          eventHandlers={{
            click: () => onMarkerClick?.(item.name)
          }}
        >
          <Popup>
            <strong style={{color: '#333'}}>{item.name}</strong>
          </Popup>
        </Marker>
      ))}
      {markers.length > 0 && <MapBounds markers={markers} />}
    </MapContainer>
  );
}
