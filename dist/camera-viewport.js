// Camera dimensions are world units; canvas layout and backing pixels stay separate.
export const MOBILE_VIEW_WIDTH=540;
export function cameraViewport({width,height,coarse=false,mode='default',customWidth}={}){
  const screenWidth=Number.isFinite(width)&&width>0?width:1;
  const screenHeight=Number.isFinite(height)&&height>0?height:1;
  const mobilePortrait=coarse&&screenWidth<600&&screenHeight>=screenWidth;
  const custom=Number.isInteger(customWidth)&&customWidth>=240&&customWidth<=1600;
  const viewWidth=mode==='native'?screenWidth:mode==='custom'&&custom?customWidth:mobilePortrait?MOBILE_VIEW_WIDTH:screenWidth;
  return {width:viewWidth,height:viewWidth===screenWidth?screenHeight:screenHeight*viewWidth/screenWidth,zoom:screenWidth/viewWidth};
}
