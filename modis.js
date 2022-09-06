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

//for comparison
//var startDate = '2020-01-01';
//var endDate = ee.Date('2020-12-31');

var startDate = '2017-04-01';
var endDate = '2022-05-31';


function generate_collection(geometry) {
   var byMonth = ee.ImageCollection('MODIS/006/MOD13A1')
    .filter(ee.Filter.date(startDate, endDate))
    .select(['NDVI', 'EVI'])
    .map(function (image) { return image.divide(10000).set('system:time_start', image.get('system:time_start')) });

  return byMonth;
}




function generate_chart(byMonth, geometry) {
  var chart = ui.Chart.image.series({
    imageCollection: byMonth,
    region: geometry,
    scale: 100,
    reducer: ee.Reducer.mean(),

  }).setOptions({
    vAxis: { title: 'Index intensity' },
    colors: ['e37d05', '1d6b99'],
  })
  return chart;
}

var create_feature = function(img){
    var value = img.reduceRegion(ee.Reducer.mean(), geometry).select(["NDVI", "EVI"]);
    
    var ft = ee.Feature(null, {'system:time_start': img.date(), 
                              'NDVI': value.get("NDVI"),
                              'EVI': value.get("EVI")
    });
    return ft;
  };


function generate_thumbnails(byMonth, geometry) {

  var args = {
    crs: 'EPSG:4326',
    dimensions: '500',
    region: geometry,
    framesPerSecond: 1
  };

  var text = require('users/gena/packages:text'); // Import gena's package which allows text overlay on image

  var annotations = [
    { position: 'left', offset: '1%', margin: '1%', property: 'label', scale: Map.getScale() * 2 }
  ];

  function addText(image) {

    var timeStamp = ee.Date(image.get('system:time_start')).format().slice(0, 7); // get the time stamp of each frame. This can be any string. Date, Years, Hours, etc.
    timeStamp = ee.String(timeStamp); //convert time stamp to string 

    image = image.visualize({ //convert each frame to RGB image explicitly since it is a 1 band image
      forceRgbOutput: true,
      min: -1,
      max: 1,
      palette: ['red', 'orange', 'white', 'steelblue', 'green']
    }).set({ 'label': timeStamp }); // set a property called label for each image

    var annotated = text.annotateImage(image, {}, geometry, annotations); // create a new image with the label overlayed using gena's package

    return annotated;
  }

  var collection = byMonth.map(addText) //add time stamp to all images

  return ui.Thumbnail(collection, args);

}



function control () {
  //define the left panel with some info and add it to the ui
  var panel = ui.Panel({
    style: { width: '400px' }
  })
  .add(ui.Label("Use drawing tool to define a region."))
  
  ui.root.add(panel);
  

  //define the reset button and add it to the map
  var reset_button = ui.Button({ label: 'Clear drawing', style: { position: 'bottom-left' } });
  var drawingTools = Map.drawingTools();
  
  reset_button.onClick(function () {
    while (drawingTools.layers().length() > 0) {
      var layer = drawingTools.layers().get(0);
      drawingTools.layers().remove(layer);
    }
  });
  
  Map.add(reset_button)
  
  //define chart and thumbnail widgets
  var ndvi_chart;
  var color_scale = ui.Label({value: "From -1 to 1: Red, Orange, White, Steelblue, Green", style: {textAlign: "center", width: '400px', fontSize: '15px', color: '484848'}});

  var ndvi_label = ui.Label({value: "NDVI", style: {textAlign: "center", width: '400px', fontSize: '40px', color: '484848'}});
  var ndvi_thumbnails;

  var evi_label = ui.Label({value: "EVI", style: {textAlign: "center", width: '400px', fontSize: '40px', color: '484848'}});
  var evi_thumbnails;
  
  //the refresh function centers the map the to selected region
  //removes the old widgets
  //generates a new image collection
  //generates a new line chart
  //and generates a new thumbnail series
  function refresh(geometry) {
    Map.centerObject(geometry);
    panel.remove(ndvi_chart);

    panel.remove(color_scale);

    panel.remove(ndvi_label);
    panel.remove(ndvi_thumbnails);
    
    panel.remove(evi_label);
    panel.remove(evi_thumbnails);
  
    var byMonth_ndvi_evi = generate_collection(geometry);

    ndvi_chart = generate_chart(byMonth_ndvi_evi, geometry);
    panel.add(ndvi_chart);
    panel.add(color_scale);
    
    print (byMonth_ndvi_evi)
    
    panel.add(ndvi_label)
    ndvi_thumbnails = generate_thumbnails(byMonth_ndvi_evi.select(["NDVI"]), geometry);
    panel.add(ndvi_thumbnails);

    panel.add(evi_label)
    evi_thumbnails = generate_thumbnails(byMonth_ndvi_evi.select(["EVI"]), geometry);
    panel.add(evi_thumbnails);
    
    var TS = byMonth_ndvi_evi.map(create_feature);
    
    print (TS)
    
    Export.table.toDrive({
      collection: TS, 
      description: 'Export', 
      fileNamePrefix: 'modis_ndvi_evi', 
      fileFormat: 'CSV'
    });
    
  }
  
  //when the user redraw the region, refresh
  Map.drawingTools().onDraw(function (new_geometry) {
    geometry = new_geometry;
    refresh(geometry);
    
    
  })
  
  refresh(geometry);
  
}



control();
