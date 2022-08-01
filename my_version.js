

// Import the Landsat 8 TOA image collection.
var l8 = ee.ImageCollection('LANDSAT/LC08/C01/T1_TOA');

// Get the least cloudy image in 2015.
var image = ee.Image(
  l8.filterBounds(geometry)
    .filterDate('2015-01-01', '2015-12-31')
    .sort('CLOUD_COVER')
    .first()
);

var ndvi = image.normalizedDifference(['B5', 'B4']).rename('NDVI');

print (ndvi);

var meanDictionary = ndvi.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: geometry,
  scale: 30,
  maxPixels: 1e9
});

print (meanDictionary);


var stdDictionary = ndvi.reduceRegion({
  reducer: ee.Reducer.stdDev(),
  geometry: geometry,
  scale: 30,
  maxPixels: 1e9
});

print (stdDictionary);

// Display the result.
Map.centerObject(image, 9);
var ndviParams = {min: -1, max: 1, palette: ['blue', 'white', 'green']};
Map.addLayer(ndvi, ndviParams, 'NDVI image');