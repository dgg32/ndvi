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
var endDate = ee.Date('2022-05-31');


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
    
    var mask = (veg.eq(1)).or(soil.eq(1));

    return image.updateMask(mask).selfMask();
}

function getNDVI(image) {
  //  (NIR - red) / (NIR + red)
  var NDVI = image.expression(
      '(NIR - RED) / (NIR +  RED)', {
          'NIR': image.select('B8').divide(10000),
          'RED': image.select('B4').divide(10000)
      }).rename("NDVI")

  image = image.addBands(NDVI)

  return(image)
}

function getEVI(image) {
    // Compute the EVI using an expression.
    var EVI = image.expression(
        '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
            'NIR': image.select('B8').divide(10000),
            'RED': image.select('B4').divide(10000),
            'BLUE': image.select('B2').divide(10000)
        }).rename("EVI")

    image = image.addBands(EVI)

    return(image)
}
    

var step = 1;

var nMonths = ee.Number(endDate.difference(ee.Date(startDate), 'month')).subtract(1).round();


function generate_collection(geometry) {
    var s2_sr = ee.ImageCollection('COPERNICUS/S2_SR')
                  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 20);
    
    s2_sr = s2_sr.map(maskS2clouds);
    s2_sr = s2_sr.map(keepFieldPixel);
    
    s2_sr = s2_sr.map(getNDVI);
    s2_sr = s2_sr.map(getEVI);
    
  var byMonth = ee.ImageCollection(
    ee.List.sequence(0, nMonths, step).map(function (n) {
      
      var ini = ee.Date(startDate).advance(n, 'month');
      var end = ini.advance(step, 'month');
      
      var image = s2_sr.filterDate(ini, end)
      .filterBounds(geometry)
      .select(["NDVI", "EVI"])
      .reduce(ee.Reducer.mean());

      var ndvi_evi = ee.Algorithms.If(image.bandNames().length().gt(0), 
      image.set('system:time_start', ini),
      ee.Image().addBands(0).rename(["NDVI_mean", "EVI_mean"]).selfMask().set('system:time_start', ini))

      return ndvi_evi;
    })
  );

  return byMonth;
}




function generate_chart(byMonth, geometry) {
  var chart = ui.Chart.image.series({
    imageCollection: byMonth,
    region: geometry,
    scale: 100,
    reducer: ee.Reducer.mean(),

  }).setOptions({
    vAxis: { title: 'Vegetation over time' },
    colors: ['e37d05', '1d6b99'],
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
      min: 0,
      max: 1,
      palette: ['red', 'orange', 'steelblue', 'green']
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

    panel.remove(ndvi_label);
    panel.remove(ndvi_thumbnails);
    
    panel.remove(evi_label);
    panel.remove(evi_thumbnails);
  
    var byMonth_ndvi_evi = generate_collection(geometry);

    ndvi_chart = generate_chart(byMonth_ndvi_evi, geometry);
    panel.add(ndvi_chart);
    
    
    print (byMonth_ndvi_evi)
    panel.add(ndvi_label)
    ndvi_thumbnails = generate_thumbnails(byMonth_ndvi_evi.select(["NDVI_mean"]), geometry);
    panel.add(ndvi_thumbnails);

    panel.add(evi_label)
    evi_thumbnails = generate_thumbnails(byMonth_ndvi_evi.select(["EVI_mean"]), geometry);
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
