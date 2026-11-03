// 將 MIT 授權 taiwan-atlas 已投影圖資轉為靜態路徑；網站不需額外地圖套件或定位權限。
const fs = require('node:fs');
const topology = JSON.parse(fs.readFileSync('taiwan-counties-source.json', 'utf8'));
const arcs = topology.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(point => {
    x += point[0]; y += point[1];
    return [x * topology.transform.scale[0] + topology.transform.translate[0],
      y * topology.transform.scale[1] + topology.transform.translate[1]];
  });
});
const paths = topology.objects.counties.geometries.map(county => {
  const polygons = county.type === 'Polygon' ? [county.arcs] : county.arcs;
  const d = polygons.map(polygon => polygon.map(ring => {
    const points = ring.flatMap((index, i) => {
      const part = index < 0 ? arcs[~index].slice().reverse() : arcs[index];
      return i ? part.slice(1) : part;
    });
    return points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + 'Z';
  }).join('')).join('');
  return { name: county.properties.COUNTYNAME.replace(/^台/, '臺'), d };
});
fs.writeFileSync('taiwan-counties.js', '// Map geometry: taiwan-atlas (MIT), derived from Ministry of the Interior. See taiwan-map-LICENSE.txt.\nconst TAIWAN_COUNTY_PATHS = ' + JSON.stringify(paths) + ';\n');
console.log(`已產生 ${paths.length} 個縣市路徑`);
