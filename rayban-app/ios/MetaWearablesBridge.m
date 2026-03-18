#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/**
 * Objective-C bridging declarations for MetaWearablesBridge (Swift).
 *
 * React Native requires ObjC RCT_EXTERN_MODULE / RCT_EXTERN_METHOD
 * macros to expose Swift native modules to the JS bridge.
 */
@interface RCT_EXTERN_MODULE(MetaWearablesBridge, RCTEventEmitter)

RCT_EXTERN_METHOD(initialize:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isCompanionAppInstalled:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(connectToGlasses:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(disconnectGlasses:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getConnectionState:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestCameraAccess:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(startCameraStream:(NSString *)resolution
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopCameraStream:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(triggerHaptic:(NSString *)intensity)

RCT_EXTERN_METHOD(playSpatialAudio:(double)bearing
                  sound:(NSString *)sound
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
