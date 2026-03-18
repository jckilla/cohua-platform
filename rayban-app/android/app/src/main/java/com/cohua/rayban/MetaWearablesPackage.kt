package com.cohua.rayban

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * MetaWearablesPackage — Registers MetaWearablesBridgeModule with React Native.
 *
 * Add to MainApplication.kt getPackages():
 *
 *   override fun getPackages(): List<ReactPackage> {
 *       val packages = PackageList(this).packages.toMutableList()
 *       packages.add(MetaWearablesPackage())
 *       return packages
 *   }
 */
class MetaWearablesPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> {
        return listOf(MetaWearablesBridgeModule(reactContext))
    }

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> = emptyList()
}
