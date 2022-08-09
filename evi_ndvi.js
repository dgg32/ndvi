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
var endDate = ee.Date('2021-07-31');


//var areaPerPixel = ee.Image.pixelArea();

function maskS2clouds(image) {
    var qa = image.select('QA60');
  
    // Bits 10 and 11 are clouds and cirrus, respectively.
    var cloudBitMask = 1 << 10;
    var cirrusBitMask = 1 << 11;
  
    // Both flags should be set to zero, indicating clear conditions.
    var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
        .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  
    return image.updateMask(mask).selfMask();
}

function keepFieldPixel(image) {
    // Select SCL layer
    var scl = image.select('SCL'); 
    // Select vegetation and soil pixels
    var veg = scl.eq(4); // 4 = Vegetation
    var soil = scl.eq(5); // 5 = Bare soils
    var water = scl.eq(6);
    // Mask if not veg or soil
    
    // or or and??????????????????
    //var mask = (veg.neq(1)).or(soil.neq(1));
    
    var mask = (veg.eq(1)).or(soil.eq(1));
    //var mask = soil.eq(1);
    //var mask = water.neq(1);
    return image.updateMask(mask).selfMask();
}



var step = 3;

var nMonths = ee.Number(endDate.difference(ee.Date(startDate), 'month')).subtract(1).round();


function generate_ndvi_collection(geometry) {
    var s2_sr = ee.ImageCollection('COPERNICUS/S2_SR')
                  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 20);
    
    s2_sr = s2_sr.map(maskS2clouds);
    s2_sr = s2_sr.map(keepFieldPixel);


  var byMonth = ee.ImageCollection(
    ee.List.sequence(0, nMonths, step).map(function (n) {
      
      var ini = ee.Date(startDate).advance(n, 'month');
      var end = ini.advance(step, 'month');
      
      var image = s2_sr.filterDate(ini, end)
      .filterBounds(geometry)
      .select(["B8", "B4"])
      .reduce(ee.Reducer.mode());

      var ndvi = image.normalizedDifference(['B8_mode', 'B4_mode']).rename('NDVI').set('system:time_start', ini);

      return ndvi;
    })
  );

  return byMonth;
}

function generate_evi_collection(geometry) {
    var landsat = ee.ImageCollection('LANDSAT/LC08/C01/T1_8DAY_EVI');


  var byMonth = ee.ImageCollection(
    ee.List.sequence(0, nMonths, step).map(function (n) {
      
      var ini = ee.Date(startDate).advance(n, 'month');
      var end = ini.advance(step, 'month');
      
      var image = landsat.filterDate(ini, end)
      .filterBounds(geometry)
      .select(["EVI"])
      .reduce(ee.Reducer.mode()).set('system:time_start', ini);

      return image;
    })
  );

  return byMonth;
}


function generate_chart(byMonth, geometry, key) {
  var chart = ui.Chart.image.series({
    imageCollection: byMonth,
    region: geometry,
    scale: 100,
    reducer: ee.Reducer.mean(),

  }).setOptions({
    vAxis: { title: key + ' over time' }
  })
  return chart;
}




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
  var ndvi_thumbnails;

  var evi_chart;
  var evi_thumbnails;
  
  //the refresh function centers the map the to selected region
  //removes the old widgets
  //generates a new image collection
  //generates a new line chart
  //and generates a new thumbnail series
  function refresh(geometry) {
    Map.centerObject(geometry);
    panel.remove(ndvi_chart);
    panel.remove(ndvi_thumbnails);

    panel.remove(evi_chart);
    panel.remove(evi_thumbnails);
  
    var byMonth_ndvi = generate_ndvi_collection(geometry);
    
    var byMonth_evi = generate_evi_collection(geometry);


    ndvi_chart = generate_chart(byMonth_ndvi, geometry, "NDVI");
    panel.add(ndvi_chart);

    ndvi_thumbnails = generate_thumbnails(byMonth_ndvi, geometry);
    panel.add(ndvi_thumbnails);


    evi_chart = generate_chart(byMonth_evi, geometry, "EVI");
    panel.add(evi_chart);

    evi_thumbnails = generate_thumbnails(byMonth_evi, geometry);
    panel.add(evi_thumbnails);
    
  }
  
  //when the user redraw the region, refresh
  Map.drawingTools().onDraw(function (new_geometry) {
    geometry = new_geometry;
    refresh(geometry);
  })
  
  refresh(geometry);
  
}



control();