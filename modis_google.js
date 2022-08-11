// Define a region of pixels to reduce and chart a time series for.
var geometry = 
    /* color: #ff0000 */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[10.827071714345609, 51.73049767694755],
          [10.827071714345609, 51.71369593202651],
          [10.881145048085843, 51.71369593202651],
          [10.881145048085843, 51.73049767694755]]], null, false);
// Define an image collection time series to chart, MODIS vegetation indices
// in this case.
var imgCol = ee.ImageCollection('MODIS/006/MOD13A1')
  .filter(ee.Filter.date('2017-04-01', '2022-05-31'))
  .select(['NDVI', 'EVI']);

// Define the chart and print it to the console.
var chart = ui.Chart.image.series({
  imageCollection: imgCol,
  region: geometry,
  reducer: ee.Reducer.mean(),
  scale: 500,
  xProperty: 'system:time_start'
})
.setSeriesNames(['EVI', 'NDVI'])
.setOptions({
  title: 'Average Vegetation Index Value by Date',
  hAxis: {title: 'Date', titleTextStyle: {italic: false, bold: true}},
  vAxis: {
    title: 'Vegetation index (x1e4)',
    titleTextStyle: {italic: false, bold: true}
  },
  lineWidth: 5,
  colors: ['e37d05', '1d6b99'],
  curveType: 'function'
});
print(chart);