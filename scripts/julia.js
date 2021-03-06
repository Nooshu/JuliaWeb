// julia.js - 2016.08.13 to 2016.08.29 - Atlee Brink
// TODO: convert to ECMAScript 6 when the time is right

var InitialValues = {
  C: {r: 0.0, i: 0.0},
  insideColor: 'rgb(255,255,245)',
  insideShading: FractalWorker.insideShadingDefault, // fractalworker.js
  maxIts: 80,
  outsideColor: 'rgb(5,2,12)',
  outsideShading: FractalWorker.outsideShadingDefault, // fractalworker.js
  renderFunction: FractalWorker.renderFunctionDefault, // fractalworker.js
  rotation: 0.0,
  scaleRPow2: 0.0,
  textColor: 'white',
  Z: {r: 0.0, i: 0.0}
}

var InteractionLimits = {
  CBig: {min: -1.99, max: 1.99, step: 0.01},
  CSmall: {min: -0.01, max: 0.01, step: 0.00001},
  maxIts: {min: 1, max: 250, step: 1},
  rotation: {min: -190, max: 190, step: 0.1},
  scaleRPow2: {min: -4, max: 48, step: 0.01, ratePerPixel: 0.2},
  Z: {min: -10, max: 10}
}

////////////////////////////////////////
// interaction variables
////////////////////////////////////////
var C, CrBig, CrSmall, CiBig, CiSmall
var insideColor, insideShading
var maxIts
var outsideColor, outsideShading
var panStartCursor, panStartZ
var renderFunction
var scaleRPow2
var textColor
var Z

////////////////////////////////////////
// rendering variables
////////////////////////////////////////
var canvas = document.getElementById('canvas')
var offscreenCanvas
var drawBuffer
var canvasChunksX = 4, canvasChunksY = 4 // more chunks => smaller chunks => more balanced multithreading
var allowRendering = false // changed to 'true' during initialization at the appropriate place

// Web Workers
var numWorkers = 12 // what is the max? what happens if we make too many?
var workers = null
var pendingTasks = null
var numPendingTasks = 0
var futureRender = false
var frameID = 0 // increment by 1 before issuing a frame; wrap back to 0 at some point (arbitrary)

// progressive rendering (note: this has a high overhead on Safari in particular, so use sparingly)
// note: if Web Worker transferables are ever correctly implemented by browsers, progressive rendering should become useful
var progChunks = {x: 1, y: 1}
var progCoords = {x: 0, y: 0}
var progComplete = 0

// cache: TODO: better-organize these values and their manipulating functions
var dZrx = 0.0, dZix = 0.0
var dZry = 0.0, dZiy = 0.0
var step

// UI update rate limiting
var updateUITimeLast = 0
var updateUIMinInterval = 1 / 30
var needsUIUpdated = false

////////////////////////////////////////
// program starts here
////////////////////////////////////////
window.onload = 
function () {
  
  // check for WebWorker support
  if( typeof(Worker) === 'undefined' ) {
    document.getElementById('errorWebWorkers').style.display = 'table'
    return
  }

  // try to set initial values from URL string
  setInitialValuesFromUrl()

  // initialize variables
  initC()
  insideColor = new ColorInput( 'insideColor', InitialValues.insideColor, function( value ) { initDrawBuffer( value ); fractalRenderAsync() } )
  insideShading = new ShadingSelector( 'insideShading', FractalWorker.insideShadingFunctions, InitialValues.insideShading, function( value ) { fractalRenderAsync() } )
  initMaxIts()
  outsideColor = new ColorInput( 'outsideColor', InitialValues.outsideColor, function( value ) { document.getElementById('body').style['background-color'] = value; } )
  outsideShading = new ShadingSelector( 'outsideShading', FractalWorker.outsideShadingFunctions, InitialValues.outsideShading, function( value ) { fractalRenderAsync() } )
  initRotation()
  renderFunction = new RenderFunctionSelector( 'renderFunction', FractalWorker.renderFunctions, InitialValues.renderFunction, function( value ) { fractalRenderAsync() } )
  initScaleRPow2()
  textColor = InitialValues.textColor
  initZ()

  // visually prepare the HTML body so there's something to look at while initializing other stuff
  var body = document.getElementById('body')
  body.style['color'] = textColor
  outsideColor.doChange()

  // multithreading
  initWorkers()

  // canvas
  initCanvasResizeMechanism()

  allowRendering = true

  // first render occurs here
  insideColor.doChange()

  // setup handlers for the mouse wheel and mouse drag
  initPanZoom()

  // show the controls
  document.getElementById('controls').style.display = 'flex'
}

////////////////////////////////////////
// experimental
////////////////////////////////////////
// todo: move somewhere more appropriate maybe
function onPicture() {
  alert("this feature isn't fully implemented yet!")

  // todo: ask user for render dimensions
  var width = 500, height = 400
  // todo: generate a filename that says something about the fractal
  var filename = 'fractal-picture-from-atleebrink.com.png'

  // prepare render canvas
  var backgroundCanvas = document.createElement('canvas')
  backgroundCanvas.width = width
  backgroundCanvas.height = height

  var backgroundContext = backgroundCanvas.getContext('2d')
  backgroundContext.fillStyle = outsideColor
  backgroundContext.fillRect(0, 0, width, height)

  // todo: put into a non-display render mode somehow, and resize all the buffers (can resize them back afterward)
  // todo: render fractal as normal (will go into high-res draw buffer)
  // todo: either use a different worker callback, or use a task flag or something,
  //       so that the output is not displayed on the normal canvas, but instead is just drawn into
  //       the draw buffer
  // todo: when done rendering, needs to finish the process and trigger the file save
  var pictureCanvas = backgroundCanvas

  var picture = pictureCanvas.toDataURL('image/png').replace('data:image/png', 'data:application/octet-stream')
  var anchor = document.createElement('a')
  anchor.download = filename // note: this should work on Safari soon, but doesn't work at this moment
  anchor.href = picture
  anchor.click()

  //window.location.href = anchor
  /*
  var imageWindow = window.open( pictureCanvas.toDataURL('image/png'), '_blank')
  if( imageWindow ) imageWindow.focus()
  else {
    alert("A picture was rendered, but your browser isn't allowing the PNG to be displayed.")
  }
  */
  
  // todo: set back into display render-mode
}

////////////////////////////////////////
// "Object" Constructors
////////////////////////////////////////

function ColorInput( domInputId, initial, fnOnChange ) {
  var me = this

  this.value = initial
  this.doChange = function() { fnOnChange( this.value ) }

  this.el = document.getElementById( domInputId )
  this.el.value = this.value
  this.el.onblur = function() { set( this.value ) }
  this.el.onkeydown = function(event) { if( event.keyCode === 13 ) set( this.value ) }

  function set( newValue ) { if( newValue != me.value ) { me.value = newValue; me.doChange() } }
}

function RenderFunctionSelector( domSelectorId, functionsObject, initial, fnOnChange ) {
  var me = this

  this.value = initial
  this.doChange = function() { fnOnChange( this.value ) }

  this.el = document.getElementById( domSelectorId )
  this.el.onchange = function() { set( this.value ) }

  for( var renderFunctionName in functionsObject ) {
    var option = document.createElement('option')
    option.text = renderFunctionName
    option.selected = renderFunctionName == initial
    this.el.add( option )
  }

  function set( newValue ) { me.value = newValue; me.doChange() }
}

function ShadingSelector( domSelectorId, functionsObject, initial, fnOnChange ) {
  var me = this

  this.value = initial
  this.doChange = function() { fnOnChange( this.value ) }

  this.el = document.getElementById( domSelectorId )
  this.el.onchange = function() { set( this.value ) }

  for( var shadingName in functionsObject ) {
    var option = document.createElement('option')
    option.text = shadingName
    option.selected = shadingName == initial
    this.el.add( option )
  }

  function set( newValue ) { me.value = newValue; me.doChange() }
}

function Slider( domSliderId, initial, min, max, step, fnOnChange, fnShow ) {
  var me = this

  this.value = initial
  this.min = min
  this.max = max
  this.changed = true
  this.doChange = function() { fnOnChange( this.value ) }
  this.show = function() { if( this.changed ) { fnShow(); this.changed = false } }

  this.slider = document.getElementById( domSliderId )
  this.slider.min = min
  this.slider.max = max
  this.slider.step = step
  this.slider.value = initial
  this.slider.oninput = function() { me.set( Number(this.value) ) }
  this.slider.onchange = function() { me.set( Number(this.value) ) }

  this.set = function( newValue ) { if( newValue !== me.value ) { me.changed = true; me.value = newValue; me.doChange() } }
}

////////////////////////////////////////
// Initializers
////////////////////////////////////////

function initC() {
  var infoCr = document.getElementById('infoCr')
  var infoCi = document.getElementById('infoCi')
  var onchange = function() { setC(); fractalRenderAsync(); updateUI(false) }
  var showCr = function() { if( C.rChanged ) { infoCr.innerHTML = (C.r >= 0 ? "+" : "-") + Math.abs(C.r).toFixed(5); C.rChanged = false } }
  var showCi = function() { if( C.iChanged ) { infoCi.innerHTML = (C.i >= 0 ? "+" : "-") + Math.abs(C.i).toFixed(5); C.iChanged = false } }
  var blim = InteractionLimits.CBig
  var slim = InteractionLimits.CSmall
  var crbig = Math.min( blim.max, Math.max( blim.min, Math.trunc( InitialValues.C.r / blim.step ) * blim.step ) )
  var crsmall = InitialValues.C.r - crbig
  var cibig = Math.min( blim.max, Math.max( blim.min, Math.trunc( InitialValues.C.i / blim.step ) * blim.step ) )
  var cismall = InitialValues.C.i - cibig

  CrBig = new Slider( 'CrBig', crbig, blim.min, blim.max, blim.step, onchange, showCr )
  CrSmall = new Slider( 'CrSmall', crsmall, slim.min, slim.max, slim.step, onchange, showCr )
  CiBig = new Slider( 'CiBig', cibig, blim.min, blim.max, blim.step, onchange, showCi )
  CiSmall = new Slider( 'CiSmall', cismall, slim.min, slim.max, slim.step, onchange, showCi )
  C = {r: InitialValues.C.r, i: InitialValues.C.i}
  C.rChanged = true
  C.iChanged = true

  function setC() {
    var Cr = CrBig.value + CrSmall.value
    var Ci = CiBig.value + CiSmall.value
    C.rChanged = Cr != C.r
    if( C.rChanged ) C.r = Cr
    if( C.iChanged = Ci != C.i ) C.i = Ci
  }
}

function initMaxIts() {
  var info = document.getElementById('infoMaxIts')
  var onchange = function() { fractalRenderAsync(); updateUI(false) }
  var show = function() { info.innerHTML = maxIts.value.toFixed() }
  var lim = InteractionLimits.maxIts
  maxIts = new Slider( 'maxIts', InitialValues.maxIts, lim.min, lim.max, lim.step, onchange, show )
}

function initRotation() {
  var info = document.getElementById('infoRotation')
  var onchange = function() { fractalRenderAsync(); updateUI(false) }
  var show = function() { info.innerHTML = (-rotation.value).toFixed(1) }
  var lim = InteractionLimits.rotation
  rotation = new Slider( 'rotation', InitialValues.rotation, lim.min, lim.max, lim.step, onchange, show )
  rotation.toRadians = function() { return Math.PI * rotation.value / -180.0 }
}

function initScaleRPow2() {
  var info = document.getElementById('infoScale')
  var onchange = function() { fractalRenderAsync(); updateUI(false) }
  var show = function() { scaleRPow2.slider.value = scaleRPow2.value; info.innerHTML = Math.pow(2, scaleRPow2.value).toExponential(1) }
  var lim = InteractionLimits.scaleRPow2
  scaleRPow2 = new Slider( 'scaleRPow2', InitialValues.scaleRPow2, lim.min, lim.max, lim.step, onchange, show )
  scaleRPow2.ratePerPixel = lim.ratePerPixel
}

function initZ() {
  var infoZr = document.getElementById('infoZr')
  var infoZi = document.getElementById('infoZi')
  Z = {r: InitialValues.Z.r, i: InitialValues.Z.i}
  Z.changed = true
  Z.set = function( r, i ) {
    if( r !== Z.r ) { Z.r = r; Z.changed = true }
    if( i !== Z.i ) { Z.i = i; Z.changed = true }
  }
  Z.show = function() {
    const rLog10 = 1 / Math.log( 10 )
    if( Z.changed ) {
      var numDigits = Math.log( Math.pow( 2, scaleRPow2.value + 12 ) ) * rLog10
      infoZr.innerHTML = (Z.r >= 0 ? "+" : "-") + Math.abs( Z.r ).toFixed(numDigits)
      infoZi.innerHTML = (Z.i >= 0 ? "+" : "-") + Math.abs( Z.i ).toFixed(numDigits)
      Z.changed = false
    }
  }
}

////////////////////////////////////////
// URL parameters
////////////////////////////////////////

function getAllNameValuePairsFromUrlString( url ) {
  function getArgStringFromUrlString( url ) {
    var qu = url.indexOf('?')
    return qu > -1 && decodeURIComponent( url.substr( url.indexOf('?') + 1 ) ) || ""
  }

  function getNameValuePairFromArg( arg ) {
    var eq = arg.indexOf('=')
    if( eq > -1 ) {
      var pair = {}
      pair[ arg.substring(0, eq).trim() ] = arg.substr(eq + 1).trim()
      return pair
    }
    return null
  }

  var argList = getArgStringFromUrlString( url ).split('&')
  var pairs = {}

  for( var idx in argList ) {
    var pair = getNameValuePairFromArg( argList[idx] )
    if( pair ) for( var key in pair ) pairs[key] = pair[key]
  }

  return pairs
}

function validateColorString( rawColorString ) {
  var hidden = document.createElement('span')
  hidden.style['color'] = rawColorString
  return hidden.style['color']
}

function setInitialValuesFromUrl() {
  var pairs = getAllNameValuePairsFromUrlString( window.location.href )

  if( 'Cr' in pairs ) {
    var Cr = Number( pairs['Cr'] )
    if( Cr === 0 || Cr ) {
      var min = InteractionLimits.CBig.min + InteractionLimits.CSmall.min
      var max = InteractionLimits.CBig.max + InteractionLimits.CSmall.max
      InitialValues.C.r = Math.min( max, Math.max( min, Cr ) )
    }
  }

  if( 'Ci' in pairs ) {
    var Ci = Number( pairs['Ci'] )
    if( Ci === 0 || Ci ) {
      var min = InteractionLimits.CBig.min + InteractionLimits.CSmall.min
      var max = InteractionLimits.CBig.max + InteractionLimits.CSmall.max
      InitialValues.C.i = Math.min( max, Math.max( min, Ci ) )
    }
  }

  if( 'insideColor' in pairs ) {
    var insideColor = validateColorString( pairs['insideColor'] )
    if( insideColor ) InitialValues.insideColor = insideColor
  }

  if( 'insideShading' in pairs ) {
    var insideShading = pairs['insideShading']
    if( insideShading in FractalWorker.insideShadingFunctions ) InitialValues.insideShading = insideShading
  }

  if( 'maxIts' in pairs ) {
    var maxIts = Number( pairs['maxIts'] )
    if( maxIts ) InitialValues.maxIts = Math.min( InteractionLimits.maxIts.max, Math.max( InteractionLimits.maxIts.min, maxIts ) )
  }

  if( 'outsideColor' in pairs ) {
    var outsideColor = validateColorString( pairs['outsideColor'] )
    if( outsideColor ) InitialValues.outsideColor = outsideColor
  }

  if( 'outsideShading' in pairs ) {
    var outsideShading = pairs['outsideShading']
    if( outsideShading in FractalWorker.outsideShadingFunctions ) InitialValues.outsideShading = outsideShading
  }

  if( 'renderFunction' in pairs ) {
    var renderFunction = pairs['renderFunction']
    if( renderFunction in FractalWorker.renderFunctions ) InitialValues.renderFunction = renderFunction
  }

  if( 'rotation' in pairs ) {
    var rotation = Number( pairs['rotation'] )
    if( rotation === 0 || rotation ) InitialValues.rotation = Math.min( InteractionLimits.rotation.max, Math.max( InteractionLimits.rotation.min, -rotation ) )
  }

  if( 'scaleRPow2' in pairs ) {
    var scaleRPow2 = Number( pairs['scaleRPow2'] )
    if( scaleRPow2 === 0 || scaleRPow2 ) InitialValues.scaleRPow2 = Math.min( InteractionLimits.scaleRPow2.max, Math.max( InteractionLimits.scaleRPow2.min, scaleRPow2 ) )
  }

  if( 'textColor' in pairs ) {
    var textColor = validateColorString( pairs['textColor'] )
    if( textColor ) InitialValues.textColor = textColor
  }

  if( 'Zr' in pairs ) {
    var Zr = Number( pairs['Zr'] )
    if( Zr === 0 || Zr ) InitialValues.Z.r = Math.min( InteractionLimits.Z.max, Math.max( InteractionLimits.Z.min, Zr ) )
  }

  if( 'Zi' in pairs ) {
    var Zi = Number( pairs['Zi'] )
    if( Zi === 0 || Zi ) InitialValues.Z.i = Math.min( InteractionLimits.Z.max, Math.max( InteractionLimits.Z.min, Zi ) )
  }
}

function getParameterizedUrl() {
  return encodeURI(
    'http://atleebrink.com/julia.html?' +
    'Cr=' + C.r + '&' +
    'Ci=' + C.i + '&' +
    'insideColor=' + insideColor.value + '&' +
    'insideShading=' + insideShading.value + '&' +
    'maxIts=' + maxIts.value + '&' +
    'outsideColor=' + outsideColor.value + '&' +
    'outsideShading=' + outsideShading.value + '&' +
    'renderFunction=' + renderFunction.value + '&' +
    'rotation=' + (-rotation.value) + '&' +
    'scaleRPow2=' + scaleRPow2.value + '&' +
    //'textColor=' + textColor + '&' +
    'Zr=' + Z.r + '&' +
    'Zi=' + Z.i
  )
}

function onShare() {
  // TODO: replace 'alert()' with a custom modal dialog box.
  //       It can be simple: a text field with the parameterized URL in it,
  //       already selected.
  //       It should have an obvious 'close dialog' mechanism, like a "Done" button,
  //       or a big X (I hate those though -- too ambiguous and sometimes awkward to position).
  alert( getParameterizedUrl() )
}

// TODO: tidy up UI update stuff, maybe into an object
// note: it seems necessary to throttle text element updates,
//       else Safari in particular spends all its time updating the text
//       instead of doing anything else.
function updateUI( force ) {
  var timeNow = performance.now()
  if( force || ((timeNow - updateUITimeLast) * 0.001 >= updateUIMinInterval) ) {
    // show controls and text if they've changed
    CrBig.show()
    CrSmall.show()
    CiBig.show()
    CiSmall.show()
    maxIts.show()
    rotation.show()
    scaleRPow2.show()
    Z.show()

    updateUITimeLast = timeNow
    needsUIUpdated = false
  } else {
    needsUIUpdated = true
  }
}

// canvas-resize mechanism
function initCanvasResizeMechanism() {
  // thanks to: http://htmlcheats.com/html/resize-the-html5-canvas-dyamically/
  initialize()

  function initialize() {
    window.addEventListener('resize', resizeCanvas, false)
    resizeCanvas()
    updateUI(false)
  }

  function resizeCanvas() {
    var context = canvas.getContext('2d')
    var oldImage = context.getImageData( 0, 0, canvas.width, canvas.height )
    var x = Math.floor((window.innerWidth - canvas.width) / 2)
    var y = Math.floor((window.innerHeight - canvas.height) / 2)
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    context.putImageData( oldImage, x, y )

    offscreenCanvas = document.createElement('canvas')
    offscreenCanvas.width = canvas.width
    offscreenCanvas.height = canvas.height
    offscreenContext = offscreenCanvas.getContext('2d')

    initDrawBuffer( insideColor.value )

    fractalRenderAsync()
  }
}

function initDrawBuffer( color ) {
  var w = offscreenCanvas.width, h = offscreenCanvas.height
  offscreenContext.fillStyle = color
  offscreenContext.fillRect( 0, 0, w, h )
  drawBuffer = offscreenContext.getImageData( 0, 0, w, h )
}

function initPanZoom() {
  // thanks to: http://phrogz.net/tmp/canvas_zoom_to_cursor.html
  canvas.addEventListener( 'mousedown', mouseDown, false )
  canvas.addEventListener( 'mousemove', mouseMove, false )
  canvas.addEventListener( 'mouseup', mouseUp, false )
  canvas.addEventListener( 'DOMMouseScroll', handleScroll, false )
  canvas.addEventListener( 'mousewheel', handleScroll, false )
}

function initWorkers() {
  if( typeof(Worker) != 'undefined' ) {
    workers = []
    for( var w = 0; w < numWorkers; w++ ) {
      worker = new Worker('scripts/fractalworker.js')
      worker.onmessage = fractalWorkerOnMessage
      workers.push(worker)
    }
  }
}

function mouseDown( event ) {
  var bodystyle = document.body.style

  bodystyle.mozUserSelect = 'none'
  bodystyle.webkitUserSelect = 'none'
  bodystyle.userSelect = 'none'

  var x = event.offsetX || (event.pageX - canvas.offsetLeft)
  var y = event.offsetY || (event.pageY - canvas.offsetTop)

  panStartCursor = {x: x, y: y}
  panStartZ = {r: Z.r, i: Z.i}

  event.preventDefault()
}

function mouseMove( event ) {
  if( panStartCursor && panStartZ ) {
    var x = event.offsetX || (event.pageX - canvas.offsetLeft)
    var y = event.offsetY || (event.pageY - canvas.offsetTop)

    var dx = x - panStartCursor.x
    var dy = y - panStartCursor.y

    computeZDeltas()

    var dr = dx * dZrx + dy * dZry
    var di = dx * dZix + dy * dZiy

    Z.set( panStartZ.r - dr, panStartZ.i - di )

    fractalRenderAsync()

    updateUI(false)
  }
}

function mouseUp( event ) {
  panStartCursor = null
  panStartZ = null
}

function handleScroll( event ) {
  // for getting wheel events, thanks to: http://phrogz.net/tmp/canvas_zoom_to_cursor.html
  var delta = event.wheelDelta ? event.wheelDelta / 40 : event.detail ? -event.detail : 0
  if( delta ) {

    var x = event.offsetX || (event.pageX - canvas.offsetLeft)
    var y = event.offsetY || (event.pageY - canvas.offsetTop)

    // compute new scale, but only re-render if it's in bounds and has changed 
    //var newScaleRPow2 = Math.max( scaleRPow2Min, Math.min( scaleRPow2Max, scaleRPow2 + delta * scaleRPow2RatePerPixel ) )
    var newScaleRPow2 = Math.max( scaleRPow2.min, Math.min( scaleRPow2.max, scaleRPow2.value + delta * scaleRPow2.ratePerPixel ) )
    if( newScaleRPow2 != scaleRPow2.value ) {

      // this part is complicated:

      // compute an updated value of 'step', which is the complex : pixel ratio
      computeZDeltas()

      // convert cursor coordinates to complex coordinates, which uses 'step'
      var cursorZ = xy_to_ri( x, y )

      // compute change (delta) from current complex coordinates to cursor complex coordinates
      var dZr = Z.r - cursorZ.r
      var dZi = Z.i - cursorZ.i

      // compute the new / old scale with power math (keep reciprocals in mind)
      var newScaleRatio = Math.pow( 2, scaleRPow2.value - newScaleRPow2 )

      // finally, shift new center complex coordinate toward cursor appropriately
      Z.set( cursorZ.r + dZr * newScaleRatio, cursorZ.i + dZi * newScaleRatio )

      scaleRPow2.set( newScaleRPow2 )
    }
  }
  return event.preventDefault() && false
}

// onmessage callback from worker(s)
function fractalWorkerOnMessage( event ) {
  var workerOut = event.data
  var sameFrame = workerOut.task.frameID == frameID

  if( pendingTasks && pendingTasks.length ) {
    var task = pendingTasks.shift()
    task.workerIndex = workerOut.task.workerIndex
    workers[task.workerIndex].postMessage( task )
  }

  if( sameFrame ) {
    copyFractalOutputToDrawBuffer( workerOut )
    var pos = workerOut.task.pos
    var size = workerOut.task.size
    var stride = workerOut.task.stride
    offscreenCanvas.getContext('2d').putImageData( drawBuffer, 0, 0, pos.x, pos.y, size.w * stride.x, size.h * stride.y )
  }

  if( !--numPendingTasks ) {
    if( ++progComplete == progChunks.x * progChunks.y ) progComplete = 0

    if( progComplete || futureRender ) fractalRenderAsync()

    displayFrame()
  }
}

function displayFrame( now ) {
  var context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage( offscreenCanvas, 0, 0 )

  if( needsUIUpdated ) updateUI( true )
}

function copyFractalOutputToDrawBuffer( workerOut ) {
  var inW = workerOut.task.size.w, inH = workerOut.task.size.h
  var inData = workerOut.array8

  var outX = workerOut.task.pos.x
  var outY = workerOut.task.pos.y
  var outStrideX = workerOut.task.stride.x * 4
  var outStrideY = (workerOut.task.stride.y * drawBuffer.width - inW * workerOut.task.stride.x) * 4
  var outData = drawBuffer.data

  // note: the '+ 3' at the end means we're writing to the alpha channel, which has a channel offset of 3 bytes
  var o = (outY * drawBuffer.width + outX) * 4 + 3
  var i = 0
  for( var y = 0; y < inH; ++y, o += outStrideY) {
    for( var x = 0; x < inW; ++x, o += outStrideX, ++i) {
      outData[o] = inData[i]
    }
  }
}

// TODO: put this and xy_to_ri in an object with their now-global variables for tidiness
function computeZDeltas() {
  var cw = canvas.width
  var ch = canvas.height

  step = Math.pow( 2, -scaleRPow2.value ) * 4.0 / Math.min(cw, ch)

  var radians = rotation.toRadians()
  var cos = Math.cos(radians)
  var sin = Math.sin(radians)

  dZrx = step * cos
  dZix = -step * sin
  dZry = -step * sin
  dZiy = -step * cos
}

function xy_to_ri( x, y ) {
  var x0 = (x + canvas.width / -2) * step
  var y0 = (-y + canvas.height / 2) * step

  var radians = -rotation.toRadians()
  var ncos = Math.cos(radians)
  var nsin = Math.sin(radians)

  return {r: x0 * ncos - y0 * nsin + Z.r, i: x0 * nsin + y0 * ncos + Z.i}
}

function fractalRenderAsync() {
  if( !allowRendering ) return

  if( numPendingTasks ) { // a render is in progress, so don't interrupt it
    futureRender = true
    return
  }

  if( futureRender ) {
    // start a new frame
    progComplete = 0
    frameID = (frameID + 1) % 2 // just needs to allow at least 2 unique frameID's
    futureRender = false
  }

  addRenderTasks()
  startRenderTasks()
}

function addRenderTasks() {
  // add (canvasChunksX * canvasChunksY) new render tasks,
  // but don't start them yet

  pendingTasks = [] // just in case there was something in there

  computeZDeltas()

  var canvasWidth = canvas.width
  var canvasHeight = canvas.height

  var chunkWidth = roundUpBy( Math.floor(canvasWidth / canvasChunksX), progChunks.x )
  var chunkHeight = roundUpBy( Math.floor(canvasHeight / canvasChunksY), progChunks.y )

  var topLeftZ = xy_to_ri( 0, 0 )

  var Zr = topLeftZ.r
  var Zi = topLeftZ.i

  for( var y = 0; y < canvasChunksY; ++y ) {
    var height = y < canvasChunksY - 1 ? chunkHeight : canvas.height - y * chunkHeight
    var chunkPosY = y * chunkHeight + progCoords.y
    for( var x = 0; x < canvasChunksX; ++x ) {
      var width = x < canvasChunksX - 1 ? chunkWidth : canvas.width - x * chunkWidth
      var chunkPosX = x * chunkWidth + progCoords.x

      var task = {
        frameID: frameID,
        pos: {x: chunkPosX, y: chunkPosY},
        stride: {x: progChunks.x, y: progChunks.y},
        size: {w: Math.floor(width / progChunks.x), h: Math.floor(height / progChunks.y)},
        startZ: {
          r: Zr + chunkPosX * dZrx + chunkPosY * dZry,
          i: Zi + chunkPosX * dZix + chunkPosY * dZiy
        },
        stepX: {r: dZrx * progChunks.x, i: dZix * progChunks.x},
        stepY: {r: dZry * progChunks.y, i: dZiy * progChunks.y},
        paramC: {r: C.r, i: C.i},
        paramMaxIts: maxIts.value,
        fnInsideShading: insideShading.value,
        fnOutsideShading: outsideShading.value,
        fnRender: renderFunction.value
      }
      pendingTasks.push( task )
    }
  }

  if( ++progCoords.x == progChunks.x ) {
    progCoords.x = 0
    if( ++progCoords.y == progChunks.y ) progCoords.y = 0
  }

  function roundUpBy( num, multiple ) {
    return num % multiple == 0 ? num : (Math.floor( num / multiple ) + 1) *  multiple
  }
}

function startRenderTasks() {
  numPendingTasks = pendingTasks.length
  var wlim = Math.min( workers.length, pendingTasks.length )
  for( var widx = 0; widx < wlim; ++widx ) {
    var task = pendingTasks.shift()
    task.workerIndex = widx
    workers[widx].postMessage( task )
  }
}

// END
