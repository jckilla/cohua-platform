import Foundation
import React
// Meta SDK imports — uncomment when SDK is added via SPM or CocoaPods
// import MWDATCore
// import MWDATCamera
// import MWDATMockDevice

/**
 * MetaWearablesBridge — React Native native module (iOS / Swift) that bridges
 * JS to the Meta Wearables Device Access Toolkit (DAT) SDK.
 *
 * Exposed to JS as NativeModules.MetaWearablesBridge
 *
 * Methods:
 *   - initialize(config)         — Init SDK with appId, clientToken, useMockDevice
 *   - connectToGlasses()         — Connect to Ray-Ban glasses via Bluetooth
 *   - disconnectGlasses()        — Disconnect from glasses
 *   - startCameraStream(res)     — Start 720p camera streaming
 *   - stopCameraStream()         — Stop camera stream
 *   - getConnectionState()       — Get current connection state string
 *
 * Events emitted to JS via RCTEventEmitter:
 *   - onConnectionStateChanged   — { state: "connected" | "disconnected" | ... }
 *   - onCameraFrame              — { width, height, timestamp }
 *   - onError                    — { code, message }
 *
 * TTS Routing:
 *   react-native-tts automatically routes audio to the glasses speakers
 *   when connected via Bluetooth A2DP. No special SDK call is needed.
 *
 * MockDevice Mode:
 *   When useMockDevice=true, uses mwdat-mockdevice to simulate the glasses
 *   connection and camera without physical hardware.
 */
@objc(MetaWearablesBridge)
class MetaWearablesBridge: RCTEventEmitter {

    // Real SDK references — typed as Any? until SDK is linked
    private var deviceManager: Any?   // DeviceAccessManager
    private var cameraManager: Any?   // CameraAccessManager
    private var useMockDevice = false
    private var connectionState = "disconnected"
    private var mockCameraTimer: Timer?
    private var hasListeners = false

    override init() {
        self.deviceManager = nil
        self.cameraManager = nil
        self.mockCameraTimer = nil
        super.init()
    }

    // MARK: - RCTEventEmitter overrides

    override func supportedEvents() -> [String]! {
        return [
            "onConnectionStateChanged",
            "onCameraFrame",
            "onError"
        ]
    }

    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    // MARK: - Initialize

    /**
     * Initialize the Meta Wearables SDK.
     *
     * config keys:
     *   - appId: String (1913450549305971)
     *   - clientToken: String (AR|1913450549305971|...)
     *   - useMockDevice: Bool
     */
    @objc
    func initialize(
        _ config: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let appId = config["appId"] as? String ?? ""
        let clientToken = config["clientToken"] as? String ?? ""
        useMockDevice = config["useMockDevice"] as? Bool ?? false

        if useMockDevice {
            // MockDevice mode — simulate glasses without hardware
            // Uses MWDATMockDevice framework
            //
            // let mockConfig = MockDeviceConfiguration(applicationId: appId)
            // mockConfig.enableCamera = true
            // deviceManager = DeviceAccessManager(mockConfiguration: mockConfig)
            connectionState = "mock_ready"
        } else {
            // Production mode — real SDK initialization
            // Uses MWDATCore framework
            //
            // deviceManager = DeviceAccessManager(
            //     applicationId: appId,
            //     clientToken: clientToken
            // )
            connectionState = "initialized"
        }

        resolve(true)
    }

    // MARK: - Connection

    /**
     * Check if the Meta AI companion app is installed.
     */
    @objc
    func isCompanionAppInstalled(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Check for Meta AI app via URL scheme
        if let metaAIURL = URL(string: "fb-messenger://") {
            let isInstalled = UIApplication.shared.canOpenURL(metaAIURL)
            resolve(isInstalled)
        } else {
            resolve(false)
        }
    }

    /**
     * Connect to Ray-Ban glasses via Bluetooth.
     * Emits onConnectionStateChanged events as state progresses.
     */
    @objc
    func connectToGlasses(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        if useMockDevice {
            updateConnectionState("connected")
            resolve(true)
            return
        }

        updateConnectionState("connecting")

        // Real SDK connection:
        //
        // (deviceManager as? DeviceAccessManager)?.connect { [weak self] result in
        //     switch result {
        //     case .success:
        //         self?.updateConnectionState("connected")
        //         resolve(true)
        //     case .failure(let error):
        //         self?.sendError(code: "CONNECT_ERROR", message: error.localizedDescription)
        //         reject("CONNECT_ERROR", error.localizedDescription, error)
        //     }
        // }

        // Stub: resolve immediately until SDK is linked
        updateConnectionState("connected")
        resolve(true)
    }

    /**
     * Disconnect from glasses.
     */
    @objc
    func disconnectGlasses(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        mockCameraTimer?.invalidate()
        mockCameraTimer = nil
        // Real SDK: (deviceManager as? DeviceAccessManager)?.disconnect()
        updateConnectionState("disconnected")
        resolve(true)
    }

    /**
     * Get the current connection state.
     */
    @objc
    func getConnectionState(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(connectionState)
    }

    // MARK: - Camera

    /**
     * Request camera access from the glasses.
     */
    @objc
    func requestCameraAccess(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Real SDK:
        // cameraManager = CameraAccessManager(deviceManager: deviceManager as! DeviceAccessManager)
        // cameraManager?.requestAccess { granted in
        //     resolve(granted)
        // }
        resolve(true)
    }

    /**
     * Start streaming video from the glasses camera.
     * Emits onCameraFrame events with { width, height, timestamp }.
     *
     * @param resolution — "720p" (only supported option)
     */
    @objc
    func startCameraStream(
        _ resolution: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        if useMockDevice {
            // MockDevice: emit simulated frames at ~30fps
            mockCameraTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
                guard let self = self, self.hasListeners else { return }
                self.sendEvent(withName: "onCameraFrame", body: [
                    "width": 1280,
                    "height": 720,
                    "timestamp": Date().timeIntervalSince1970 * 1000,
                    "mock": true
                ])
            }
            resolve(true)
            return
        }

        // Real SDK camera streaming:
        //
        // (cameraManager as? CameraAccessManager)?.startStreaming { [weak self] frame in
        //     guard let self = self, self.hasListeners else { return }
        //     self.sendEvent(withName: "onCameraFrame", body: [
        //         "width": frame.width,
        //         "height": frame.height,
        //         "timestamp": frame.timestamp
        //     ])
        // }

        resolve(true)
    }

    /**
     * Stop the camera stream.
     */
    @objc
    func stopCameraStream(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        mockCameraTimer?.invalidate()
        mockCameraTimer = nil
        // Real SDK: (cameraManager as? CameraAccessManager)?.stopStreaming()
        resolve(true)
    }

    // MARK: - Haptics & Audio

    /**
     * Trigger haptic feedback on the glasses.
     */
    @objc
    func triggerHaptic(_ intensity: String) {
        // Real SDK: (deviceManager as? DeviceAccessManager)?.haptics?.tap(intensity: intensity)
    }

    /**
     * Play spatial audio through the glasses speakers.
     */
    @objc
    func playSpatialAudio(
        _ bearing: Double,
        sound: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Real SDK: (deviceManager as? DeviceAccessManager)?.audio?.playSpatial(sound, bearing: bearing)
        resolve(true)
    }

    // MARK: - Internal helpers

    private func updateConnectionState(_ state: String) {
        connectionState = state
        guard hasListeners else { return }
        sendEvent(withName: "onConnectionStateChanged", body: [
            "state": state
        ])
    }

    private func sendError(code: String, message: String) {
        guard hasListeners else { return }
        sendEvent(withName: "onError", body: [
            "code": code,
            "message": message
        ])
    }
}
