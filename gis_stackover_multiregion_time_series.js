 

var g1 = 
/* color: #98ff00 */
/* displayProperties: [
  {
    "type": "rectangle"
  }
] */
ee.Geometry.Polygon(
    [[[15.822493668388423, 40.73544049580196],
      [15.822493668388423, 40.73492020129451],
      [15.825690861534175, 40.73492020129451],
      [15.825690861534175, 40.73544049580196]]], null, false),
g2 = 
/* color: #d63000 */
/* displayProperties: [
  {
    "type": "rectangle"
  }
] */
ee.Geometry.Polygon(
    [[[15.824521418403682, 40.73355440893864],
      [15.824521418403682, 40.73238370738777],
      [15.826667185615596, 40.73238370738777],
      [15.826667185615596, 40.73355440893864]]], null, false),
g3 = 
/* color: #98ff00 */
/* displayProperties: [
  {
    "type": "rectangle"
  }
] */
ee.Geometry.Polygon(
    [[[15.819199915718135, 40.7341397519895],
      [15.819199915718135, 40.7319284289995],
      [15.822203989814815, 40.7319284289995],
      [15.822203989814815, 40.7341397519895]]], null, false);
 
 // Apply negative buffer to geometry
 var geometryBuff = g1.buffer(-20)
 // Add plot and buffer to the map
 // and specify fill color and layer name
 Map.addLayer(g1,{color:'green'},'Border');
 Map.addLayer(geometryBuff,{color:'red'},'Buffer');
 
 //Convert gometries into Feature Collection
 var regions = ee.FeatureCollection([
   ee.Feature(g1,{label : 'g1'}),
   ee.Feature(g2,{label : 'g2'}),
   ee.Feature(g3,{label : 'g3'})]
   );
 
 // Center map on the plot
 Map.centerObject(g1);
 // Load image collection of Sentinel-2 imagery
 // (choose SR for atmospheric corrections to surface reflectance)
 var S2 = ee.ImageCollection('COPERNICUS/S2_SR') 
   // Remove cloudy images from the collection
   .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 20)
   // Filter to study period
   .filterDate('2019-09-01', '2020-10-01')
   // Filter to plot boundaries
   .filterBounds(geometryBuff);
   // Function to keep only vegetation and soil pixels
 function keepFieldPixel(image) {
   // Select SCL layer
   var scl = image.select('SCL'); 
   // Select vegetation and soil pixels
   var veg = scl.eq(4); // 4 = Vegetation
   var soil = scl.eq(5); // 5 = Bare soils
   // Mask if not veg or soil
   var mask = (veg.neq(1)).or(soil.neq(1));
   return image.updateMask(mask);
 }
 
 // Apply custom filter to S2 collection
 var S2 = S2.map(keepFieldPixel);
 // Filter defined here: 
 // https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR#description
 
 function maskS2clouds(image) {
   var qa = image.select('QA60');
 
   // Bits 10 and 11 are clouds and cirrus, respectively.
   var cloudBitMask = 1 << 10;
   var cirrusBitMask = 1 << 11;
 
   // Both flags should be set to zero, indicating clear conditions.
   var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
       .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
 
   return image.updateMask(mask);
 }
 
   
   // Function to compute NDVI and add result as new band
 var addNDVI = function(image) {
 return image.addBands(image.normalizedDifference(['B8', 'B4']));
 };
 
 // Add NDVI band to image collection
 var S2 = S2.map(addNDVI);
 var evoNDVI = ui.Chart.image.seriesByRegion(
   S2,                // Image collection
   geometryBuff,      // Region
   ee.Reducer.mean(), // Type of reducer to apply
   'nd',              // Band
   10);               // Scale
 var plotNDVI = evoNDVI                    // Data
     .setChartType('LineChart')            // Type of plot
     .setSeriesNames(['SCL filter only'])
     .setOptions({                         // Plot customization
       interpolateNulls: true,
       lineWidth: 1,
       pointSize: 3,
       title: 'NDVI annual evolution',
       hAxis: {title: 'Date'},
       vAxis: {title: 'NDVI'}
 });
 // Apply second filter
 var S2 = S2.map(maskS2clouds);
 
 // Plot results
 var plotNDVI = ui.Chart.image.seriesByRegion(
   S2, 
   regions,
   ee.Reducer.mean(),
   'nd',10)
   .setChartType('LineChart')
   .setSeriesNames(['geometry 1', 'geometry 2', 'geometry 3'])
   .setOptions({
     interpolateNulls: true,
     lineWidth: 1,
     pointSize: 3,
     title: 'NDVI annual evolution',
     hAxis: {title: 'Date'},
     vAxis: {title: 'NDVI'},
     series: {0:{color: 'red'}
     }
   });
   
 print(plotNDVI)