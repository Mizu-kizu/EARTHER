/**
 * globe.js — Three.js 3D Globe v2 (Premium)
 * NASA texture + normal map terrain + DoubleSide country overlays
 */

console.log('globe.js loaded, THREE:', !!THREE);
const THREE = window.THREE;
const OrbitControls = THREE.OrbitControls;

if (!THREE) {
  console.error('THREE not loaded');
  throw new Error('THREE not loaded');
}

console.log('globe.js loaded, THREE:', THREE);

// ─── Constants ───────────────────────────────────────────────────────────────
const GLOBE_R      = 1.8;
const ATMO_R       = GLOBE_R * 1.08;
const CAM_DISTANCE = 4.5;
const POLL_MS      = 5000;

// Texture CDN — Three.js r160 example assets (NASA imagery)
const TEX_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/';
const TL = new THREE.TextureLoader();
TL.setCrossOrigin('anonymous');

// Color states
const COLORS = [
  { hex: 'transparent', val: 0x000000 },  // 0 — unclaimed → transparent overlay
  { hex: '#ef4444',     val: 0xef4444 },  // 1 — red
  { hex: '#3b82f6',     val: 0x3b82f6 },  // 2 — blue
  { hex: '#10b981',     val: 0x10b981 },  // 3 — green
  { hex: '#f59e0b',     val: 0xf59e0b },  // 4 — amber
  { hex: '#8b5cf6',     val: 0x8b5cf6 },  // 5 — purple
];

function getColorVal(n) {
  if (n < COLORS.length) return COLORS[n].val;
  const hue = Math.round((n * 137.5) % 360);
  return new THREE.Color(`hsl(${hue}, 75%, 60%)`).getHex();
}
function getColorHex(n) {
  if (n < COLORS.length && n > 0) return COLORS[n].hex;
  if (n === 0) return '#64748b';
  const hue = Math.round((n * 137.5) % 360);
  return `hsl(${hue}, 75%, 60%)`;
}

// ─── Discord name → GeoJSON name aliases ─────────────────────────────────────
const DISCORD_TO_GEO = {
  'USA':                        'United States of America',
  'United States':              'United States of America',
  'UK':                         'United Kingdom',
  'Czechia':                    'Czech Republic',
  'Congo':                      'Republic of the Congo',
  'DRC':                        'Democratic Republic of the Congo',
  'Ivory Coast':                "Côte d'Ivoire",
  'South Korea':                'South Korea',
  'North Korea':                'North Korea',
  'Bosnia':                     'Bosnia and Herzegovina',
  'Macedonia':                  'Macedonia',
};

// Countries missing from the GeoJSON — shown as glowing dot markers
const CUSTOM_CENTROIDS = {
  'Palestine':       { lat: 31.9,  lon: 35.2  },
  'Scotland':        { lat: 56.8,  lon: -4.2  },
  'Wales':           { lat: 52.3,  lon: -3.8  },
  'Kosovo':          { lat: 42.6,  lon: 20.9  },
  'Taiwan':          { lat: 23.7,  lon: 121.0 },
  'Vatican City':    { lat: 41.9,  lon: 12.45 },
  'Monaco':          { lat: 43.74, lon: 7.4   },
  'San Marino':      { lat: 43.94, lon: 12.46 },
  'Liechtenstein':   { lat: 47.14, lon: 9.52  },
  'Andorra':         { lat: 42.55, lon: 1.57  },
  'Northern Ireland':{ lat: 54.6,  lon: -6.7  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Three.js Scene Setup
// ─────────────────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('globe-canvas');
console.log('canvas:', canvas);
try {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  console.log('renderer created');
} catch (e) {
  console.error('renderer creation failed', e);
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping      = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x020817);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0.8, CAM_DISTANCE);

// const controls = new OrbitControls(camera, renderer.domElement);
// controls.enableDamping  = true;
// controls.dampingFactor  = 0.06;
// controls.rotateSpeed    = 0.45;
// controls.zoomSpeed      = 0.8;
// controls.minDistance    = 2.2;
// controls.maxDistance    = 9;
// controls.enablePan      = false;
// controls.autoRotate     = true;
// controls.autoRotateSpeed = 0.35;

// Pause auto-rotate on user interaction, resume after 4s idle
// controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer); });
// let resumeTimer;
// // controls.addEventListener('end', () => {
//   resumeTimer = setTimeout(() => { controls.autoRotate = true; }, 4000);
// });

// ─────────────────────────────────────────────────────────────────────────────
// Lighting — tuned for NASA topo+bathy texture
// ─────────────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x334466, 2.5));  // enough to see night side detail

const sun = new THREE.DirectionalLight(0xfff5e0, 2.8);
sun.position.set(6, 3, 5);
scene.add(sun);

const rim = new THREE.DirectionalLight(0x2255aa, 0.5);
rim.position.set(-6, -3, -4);
scene.add(rim);

// ─────────────────────────────────────────────────────────────────────────────
// Stars
// ─────────────────────────────────────────────────────────────────────────────
(function buildStars() {
  const pos = new Float32Array(14000 * 3);
  for (let i = 0; i < 14000; i++) {
    const r   = 350 + Math.random() * 200;
    const phi = Math.acos(2 * Math.random() - 1);
    const tht = Math.random() * Math.PI * 2;
    pos[i*3]   = r * Math.sin(phi) * Math.cos(tht);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(tht);
    pos[i*3+2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.85
  })));
})();

// ─── Layer 1: NASA Topo+Bathy base — real satellite terrain & ocean depth ────
// Proxied through /tex/ to bypass NASA CORS restrictions
// Load textures locally to avoid CORS/proxy issues
const topoTex   = TL.load('/img/earth.jpg', () => console.log('topoTex loaded OK'), undefined, (e) => console.error('topoTex load ERROR', e));
const normalTex = TL.load('/img/normal.png');
const specTex   = TL.load('/img/spec.png');
topoTex.colorSpace = THREE.SRGBColorSpace;

const earthMesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_R, 128, 128),
  new THREE.MeshPhongMaterial({
    color:       0x888888,         // Base color for better visibility if texture is slow
    map:         topoTex,
    normalMap:   normalTex,
    normalScale: new THREE.Vector2(1.2, 1.2),
    specularMap: specTex,
    specular:    new THREE.Color(0x222222),
    shininess:   15,
  })
);
scene.add(earthMesh);

// ─── Layer 2: Canvas country overlay — transparent, sits just above base ─────
// Created after canvas setup below; reference stored here for easy access.
let overlaySphere = null;   // set after canvas is initialized

// ─────────────────────────────────────────────────────────────────────────────
// Atmosphere Shader
// ─────────────────────────────────────────────────────────────────────────────
const atmMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    void main() {
      float i = pow(0.75 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.5);
      gl_FragColor = vec4(0.18, 0.52, 1.0, 1.0) * i * 1.4;
    }
  `,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(ATMO_R, 64, 64), atmMat));

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate helpers
// ─────────────────────────────────────────────────────────────────────────────
function latLonToVec3(lat, lon, r) {
  const phi = (90 - lat)  * (Math.PI / 180);
  const tht = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(tht),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(tht)
  );
}

function featureCentroid(feature) {
  // Pick the LARGEST ring (most vertices) to avoid centering on tiny island parts
  const allRings = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates[0]]
    : feature.geometry.coordinates.map(p => p[0]);

  let best = null, bestLen = 0;
  for (const ring of allRings) {
    if (ring && ring.length > bestLen) { bestLen = ring.length; best = ring; }
  }
  if (!best) return null;
  let sumLat = 0, sumLon = 0;
  for (const [lon, lat] of best) { sumLon += lon; sumLat += lat; }
  return { lat: sumLat / best.length, lon: sumLon / best.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Country polygon → Three.js Mesh via earcut
// ─────────────────────────────────────────────────────────────────────────────
// Canvas Texture Approach — paint countries as 2D fills on an equirectangular
// canvas, then use it as a texture on the sphere. This guarantees solid fills.
// ─────────────────────────────────────────────────────────────────────────────
const CANVAS_W = 4096, CANVAS_H = 2048;
const offCanvas = document.createElement('canvas');
offCanvas.width  = CANVAS_W;
offCanvas.height = CANVAS_H;
const ctx = offCanvas.getContext('2d');

// Country name → array of polygon rings (in canvas pixel coords)
const countryPolygons = {};   // name → [ [ [x,y], ... ], ... ]
const countryColors   = {};   // name → hex string (current color)

function lonLatToCanvas(lon, lat) {
  return [
    ((lon + 180) / 360) * CANVAS_W,
    ((90  - lat)  / 180) * CANVAS_H,
  ];
}

function extractPolygons(feature) {
  const name   = feature.properties.name;
  const rings  = [];
  const polys  = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;

  for (const poly of polys) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      rings.push(ring.map(([lon, lat]) => lonLatToCanvas(lon, lat)));
    }
  }
  if (rings.length) countryPolygons[name] = rings;
}

function paintAllCountries() {
  // Transparent background — unclaimed areas show NASA terrain directly through
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Draw each country
  for (const [name, rings] of Object.entries(countryPolygons)) {
    const color    = countryColors[name];
    const claimed  = color && color !== '#0e1f3a';

    if (!claimed) {
      // Unclaimed: just a faint border line so country boundaries are visible
      ctx.strokeStyle = 'rgba(100, 140, 200, 0.45)';
      ctx.lineWidth   = 1.0;
      for (const ring of rings) {
        ctx.beginPath();
        ctx.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
        ctx.closePath();
        ctx.stroke();
      }
    } else {
      // Claimed: vivid semi-transparent fill so NASA terrain shows through
      ctx.globalAlpha = 0.65;
      ctx.fillStyle   = color;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth   = 1.5;
      for (const ring of rings) {
        ctx.beginPath();
        ctx.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;  // reset
    }
  }

  globeTexture.needsUpdate = true;
}

// Create overlay sphere — MeshLambertMaterial so colors dim naturally on night side
const globeTexture = new THREE.CanvasTexture(offCanvas);
overlaySphere = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_R + 0.003, 128, 128),
  new THREE.MeshLambertMaterial({
    map:         globeTexture,
    transparent: true,
    opacity:     1.0,       // alpha comes from canvas pixels themselves
    depthWrite:  false,     // don't write depth so base sphere stays behind
    side:        THREE.FrontSide,
  })
);
scene.add(overlaySphere);

// Lighting also needs to reach the overlay sphere
// (MeshLambertMaterial uses scene lights automatically)

// Dummy — kept so the rest of the code that calls buildCountryMesh still works.
// We now use invisible raycasting spheres per country for hover detection.
function buildCountryMesh(_feature) { return null; }

// ─────────────────────────────────────────────────────────────────────────────
// Country border lines
// ─────────────────────────────────────────────────────────────────────────────
function buildBorderLines(feature) {
  const lines = [];
  const rings = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;

  for (const polygon of rings) {
    for (const ring of polygon) {
      const pts = ring.map(([lon, lat]) => latLonToVec3(lat, lon, GLOBE_R + 0.004));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      lines.push(new THREE.Line(geo, borderMat));
    }
  }
  return lines;
}

const borderMat = new THREE.LineBasicMaterial({
  color: 0x2a5080,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Point marker for micro-nations
// ─────────────────────────────────────────────────────────────────────────────
// Marker geo — regular (small countries) vs custom (Palestine etc, larger)
const markerGeoSmall  = new THREE.SphereGeometry(0.022, 10, 10);
const markerGeoBig    = new THREE.SphereGeometry(0.055, 12, 12);  // bigger for custom

function buildMarker(lat, lon, color, big = false) {
  // Use MeshPhongMaterial so we can add emissive glow when claimed
  const mat = new THREE.MeshPhongMaterial({ color, emissive: 0x000000, shininess: 40 });
  const m   = new THREE.Mesh(big ? markerGeoBig : markerGeoSmall, mat);
  m.position.copy(latLonToVec3(lat, lon, GLOBE_R + (big ? 0.065 : 0.035)));
  return m;
}

// Area threshold (sq degrees) below which we add a marker
const MICRO_THRESHOLD = 2.0;

function polygonApproxArea(feature) {
  const geom = feature.geometry;
  if (!geom) return 0;

  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let totalArea = 0;

  for (const poly of polys) {
    // Only look at the outer ring (index 0)
    const ring = poly[0];
    if (!ring || ring.length < 3) continue;
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    }
    totalArea += Math.abs(area / 2);
  }
  return totalArea;
}

// ─── State ────────────────────────────────────────────────────────────────────
const countryMeshes  = [];   // { mesh, name, centroid, marker? }
let   nationCounts   = {};
let   allCountryNames = [];

// ─── Load GeoJSON, build globe ────────────────────────────────────────────────
const GEO_URL = '/world.geojson';

// Helper: yield to browser event loop
function yieldFrame() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function init() {
  console.log('init started');
  try {
    const [geoData, detailedData] = await Promise.all([
      fetch(GEO_URL).then(r => r.json()),
      fetch('/countries.json').then(r => r.json())
    ]);
    console.log('fetches done, geoData features:', geoData.features.length);
    window.detailedNations = detailedData;

  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  const features = geoData.features;
  const BATCH = 20;

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const name = feature.properties.name;
    if (!name) continue;
    allCountryNames.push(name);

    // Extract polygon data for canvas painting
    extractPolygons(feature);
    countryColors[name] = '#0e1f3a';  // default unclaimed color

    // Build invisible ghost sphere for raycasting hover detection
    const centroid = featureCentroid(feature);
    const area     = polygonApproxArea(feature);
    const ghostR   = Math.max(0.1, Math.sqrt(area) * 0.08); // Larger spheres for better click detection
    const ghost    = new THREE.Mesh(
      new THREE.SphereGeometry(ghostR, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    if (centroid) ghost.position.copy(latLonToVec3(centroid.lat, centroid.lon, GLOBE_R));
    ghost.userData = { name };
    globeGroup.add(ghost);

    let marker = null;
    if (centroid && area < MICRO_THRESHOLD) {
      marker = buildMarker(centroid.lat, centroid.lon, 0x334155);
      marker.visible = false;
      marker.userData = { name };
      globeGroup.add(marker);
    }
    countryMeshes.push({ mesh: ghost, name, centroid, marker });

    if (i % BATCH === 0) await yieldFrame();
  }

  console.log('loop done');
  // Paint all countries onto canvas once all polygons are extracted
  paintAllCountries();

  // Custom centroid entries (Palestine, Scotland, etc.) — big visible markers
  for (const [name, coord] of Object.entries(CUSTOM_CENTROIDS)) {
    allCountryNames.push(name);
    const marker = buildMarker(coord.lat, coord.lon, 0x334155, true);
    marker.visible = false;
    marker.userData = { name };
    globeGroup.add(marker);
    const ghost = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    ghost.position.copy(latLonToVec3(coord.lat, coord.lon, GLOBE_R + 0.005));
    ghost.userData = { name };
    globeGroup.add(ghost);
    countryMeshes.push({ mesh: ghost, name, centroid: coord, marker, isCustom: true });
  }

  document.getElementById('loading').classList.add('fade-out');
  setTimeout(() => { document.getElementById('loading').style.display = 'none'; }, 900);
  buildSearchList();
  startPolling();
  console.log('init finished');
} catch (e) {
  console.error('init error', e);
}

// ─────────────────────────────────────────────────────────────────────────────
// Raycasting + Hover
// ─────────────────────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2(-9999, -9999);
const tooltip   = document.getElementById('tooltip');
const ttName    = document.getElementById('tt-name');
const ttInfo    = document.getElementById('tt-info');

let   hoveredEntry = null;

canvas.addEventListener('mousemove', e => {
  mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  tooltip.style.left = e.clientX + 'px';
  tooltip.style.top  = e.clientY + 'px';
});

canvas.addEventListener('mouseleave', () => {
  mouse.set(-9999, -9999);
  clearHover();
});

canvas.addEventListener('click', () => {
  if (hoveredEntry) {
    if (hoveredEntry.centroid) {
      flyTo(hoveredEntry.centroid.lat, hoveredEntry.centroid.lon);
    }
    showPassport(hoveredEntry.name);
  } else {
    hidePassport();
  }
});

function clearHover() {
  hoveredEntry = null;
  tooltip.classList.remove('show');
}

function doRaycast() {
  raycaster.setFromCamera(mouse, camera);
  // Raycast against the earth sphere to get any hover, then find which country
  const sphereHit = raycaster.intersectObject(earthMesh);
  const ghostHits = raycaster.intersectObjects(countryMeshes.map(e => e.mesh));

  const hits = ghostHits.length > 0 ? ghostHits : [];

  if (hits.length > 0) {
    const hit   = hits[0].object;
    const entry = countryMeshes.find(e => e.mesh === hit);
    if (!entry) return;

    if (hoveredEntry !== entry) {
      clearHover();
      hoveredEntry = entry;
      // Highlight on canvas
      if (!entry.isCustom) {
        const base = countryColors[entry.name] || '#0e1f3a';
        const bright = brightenHex(base);
        countryColors[entry.name] = bright;
        paintAllCountries();
        countryColors[entry.name] = base;  // reset will happen on clearHover
      }
    }

    const count = nationCounts[entry.name] || 0;
    ttName.textContent = entry.name;
    ttInfo.textContent = count > 0 ? `${count} member${count !== 1 ? 's' : ''} claimed` : 'Unclaimed';
    tooltip.classList.add('show');
  } else {
    if (hoveredEntry) {
      // Restore color on canvas
      const name = hoveredEntry.name;
      if (countryColors[name]) paintAllCountries();
    }
    clearHover();
  }
}

// ─── Passport Card UI ────────────────────────────────────────────────────────
const passCard    = document.getElementById('passport-card');
const passFlag    = document.getElementById('pass-flag');
const passName    = document.getElementById('pass-name');
const passCap     = document.getElementById('pass-capital');
const passPop     = document.getElementById('pass-pop');
const passLang    = document.getElementById('pass-lang');
const passCur     = document.getElementById('pass-currency');
const passFact    = document.getElementById('pass-fact');
const passOverlay = document.getElementById('passport-overlay');

function showPassport(name) {
  const data = window.detailedNations[name];
  
  // Helper to set value and toggle row visibility
  const updateRow = (id, rowId, val) => {
    const el = document.getElementById(id);
    const row = document.getElementById(rowId);
    if (val && val !== 'Unknown') {
      el.textContent = val;
      row.classList.remove('hidden');
      return true;
    } else {
      row.classList.add('hidden');
      return false;
    }
  };

  passName.textContent = name;
  passFlag.textContent = data?.flag || '🌍';

  const hasCap  = updateRow('pass-capital',  'row-capital',  data?.capital);
  const hasPop  = updateRow('pass-pop',      'row-pop',      data?.pop);
  const hasLang = updateRow('pass-lang',     'row-lang',     data?.lang);
  const hasCur  = updateRow('pass-currency', 'row-currency', data?.currency);

  if (data?.fact && data.fact !== 'A wonderful place on Earth!') {
    passFact.textContent = data.fact;
    document.getElementById('pass-fact-box').classList.remove('hidden');
  } else {
    document.getElementById('pass-fact-box').classList.add('hidden');
  }
  
  passCard.classList.remove('hidden');
  passOverlay.classList.add('show');
}

function hidePassport() {
  passCard.classList.add('hidden');
  passOverlay.classList.remove('show');
}

passOverlay.addEventListener('click', hidePassport);

document.getElementById('close-pass').addEventListener('click', hidePassport);
document.getElementById('fly-to-pass').addEventListener('click', () => {
  const name = passName.textContent;
  const entry = countryMeshes.find(e => e.name === name);
  if (entry?.centroid) {
    flyTo(entry.centroid.lat, entry.centroid.lon);
  }
});

function brightenHex(hex) {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r + 0.25);
  c.g = Math.min(1, c.g + 0.25);
  c.b = Math.min(1, c.b + 0.25);
  return '#' + c.getHexString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera fly-to animation
// ─────────────────────────────────────────────────────────────────────────────
let   flyTarget   = null;
let   flyProgress = 1;
const flyDuration = 1.4; // seconds
let   flyStart    = null;
const flyFromPos  = new THREE.Vector3();
const flyToPos    = new THREE.Vector3();

function flyTo(lat, lon, distMult = 1.0) {
  // Palestine and small regions: zoom in closer so the marker is visible
  const target = latLonToVec3(lat, lon, CAM_DISTANCE * distMult);
  flyFromPos.copy(camera.position);
  flyToPos.copy(target);
  flyProgress = 0;
  flyStart    = performance.now();
  controls.autoRotate = false;
  controls.target.set(0, 0, 0);  // always orbit around globe center
  clearTimeout(resumeTimer);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function tickFly(now) {
  if (flyProgress >= 1) return;
  const elapsed = (now - flyStart) / 1000;
  flyProgress   = Math.min(elapsed / flyDuration, 1);
  const t       = easeInOutCubic(flyProgress);
  camera.position.lerpVectors(flyFromPos, flyToPos, t);
  controls.update();
}

// ─────────────────────────────────────────────────────────────────────────────
// Country color update
// ─────────────────────────────────────────────────────────────────────────────
function setCountryColor(name, count, animate = false) {
  const geoName   = DISCORD_TO_GEO[name] || name;
  const entry     = countryMeshes.find(e => e.name === geoName || e.name === name);
  if (!entry) return;

  const isClaimed = count > 0;
  const colorHex  = isClaimed ? getColorHex(count) : '#0e1f3a';
  const colorVal  = getColorVal(count);

  // Update canvas color for this country
  // Write under both keys (geoName = GeoJSON key, name = Discord key) to be safe
  if (!entry.isCustom) {
    if (countryPolygons[geoName] !== undefined) countryColors[geoName] = colorHex;
    if (countryPolygons[name]    !== undefined) countryColors[name]    = colorHex;
    paintAllCountries();
  }

  // Marker dot: show when claimed, with emissive glow
  if (entry.marker) {
    entry.marker.visible = isClaimed;
    if (isClaimed) {
      entry.marker.material.color.set(colorVal);
      entry.marker.material.emissive.set(colorVal);
      entry.marker.material.emissiveIntensity = 0.6;
    }
  }

  if (animate && isClaimed) pulseCountry(entry);
}

function pulseCountry(entry) {
  // Pulse via canvas brightness
  const name    = entry.name;
  const baseHex = countryColors[name] || '#0e1f3a';
  let t = 0;
  const step = () => {
    t += 0.08;
    if (t > 1) { countryColors[name] = baseHex; paintAllCountries(); return; }
    const c = new THREE.Color(baseHex);
    const s = Math.sin(t * Math.PI);
    c.r = Math.min(1, c.r + s * 0.5);
    c.g = Math.min(1, c.g + s * 0.3);
    c.b = Math.min(1, c.b + s * 0.3);
    countryColors[name] = '#' + c.getHexString();
    paintAllCountries();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Discord data polling
// ─────────────────────────────────────────────────────────────────────────────
function startPolling() {
  fetchData();
  setInterval(fetchData, POLL_MS);
}

async function fetchData() {
  try {
    const res  = await fetch('/api/counts');
    if (!res.ok) return;
    const data = await res.json();

    const newNations = data.nations || {};
    const allKeys = new Set([...Object.keys(nationCounts), ...Object.keys(newNations)]);
    let changed = false;

    for (const name of allKeys) {
      const oldCount = nationCounts[name] || 0;
      const newCount = newNations[name]   || 0;
      if (oldCount !== newCount) {
        nationCounts[name] = newCount;
        setCountryColor(name, newCount, newCount > oldCount);
        changed = true;
      }
    }

    if (changed) updateLeaderboard();

  } catch (e) { /* bot not connected yet — silent fail */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard
// ─────────────────────────────────────────────────────────────────────────────
function updateLeaderboard() {
  const el       = document.getElementById('leaderboard-entries');
  const entries  = Object.entries(nationCounts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  const total    = entries.reduce((s, [, c]) => s + c, 0);

  document.getElementById('total-count').textContent = total;

  if (entries.length === 0) {
    el.innerHTML = '<div id="lb-empty">Nobody has claimed any territory yet!<br><br>🌐<br><br>Use <b>/claim [country]</b> in Discord.</div>';
    return;
  }

  el.innerHTML = '';
  entries.forEach(([name, count], i) => {
    const colorHex = getColorHex(count);
    const div = document.createElement('div');
    div.className = 'lb-entry';
    div.innerHTML = `
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-dot" style="background:${colorHex}"></span>
      <span class="lb-name" title="${name}">${name}</span>
      <span class="lb-count">${count}</span>
      <span class="lb-fly" data-name="${name}">✈ Fly</span>
    `;
    const flyHandler = () => {
      const geoName = DISCORD_TO_GEO[name] || name;
      const entry   = countryMeshes.find(c => c.name === geoName || c.name === name);
      const coord   = entry?.centroid || CUSTOM_CENTROIDS[name];
      if (coord) {
        flyTo(coord.lat, coord.lon, 0.7);
        showPassport(geoName);
      }
    };
    div.querySelector('.lb-fly').addEventListener('click', e => { e.stopPropagation(); flyHandler(); });
    div.addEventListener('click', flyHandler);
    el.appendChild(div);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Search bar
// ─────────────────────────────────────────────────────────────────────────────
function buildSearchList() {
  const input   = document.getElementById('search');
  const results = document.getElementById('search-results');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    results.innerHTML = '';
    if (!q) { results.classList.remove('open'); return; }

    const matches = allCountryNames
      .filter(n => n.toLowerCase().includes(q))
      .slice(0, 12);

    if (matches.length === 0) { results.classList.remove('open'); return; }

    matches.forEach(name => {
      const count = nationCounts[name] || 0;
      const div   = document.createElement('div');
      div.className = 'sr-item';
      div.innerHTML = `${name}${count > 0 ? `<span class="sr-claimed">▶ ${count} claimed</span>` : ''}`;
      div.addEventListener('click', () => {
        input.value = '';
        results.classList.remove('open');
        const entry = countryMeshes.find(e => e.name === name);
        if (entry?.centroid) {
          flyTo(entry.centroid.lat, entry.centroid.lon, 0.7);
          showPassport(name);
        }
      });
      results.appendChild(div);
    });

    results.classList.add('open');
  });

  input.addEventListener('blur', () => {
    setTimeout(() => results.classList.remove('open'), 150);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; results.classList.remove('open'); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Resize
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─────────────────────────────────────────────────────────────────────────────
// Render loop
// ─────────────────────────────────────────────────────────────────────────────
function animate(now) {
  requestAnimationFrame(animate);
  // tickFly(now);
  // doRaycast();
  // controls.update();
  renderer.render(scene, camera);
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot — start render loop immediately, init() adds countries in background
// ─────────────────────────────────────────────────────────────────────────────
requestAnimationFrame(animate);  // globe sphere visible immediately
init();         }                 // countries load in async batches
