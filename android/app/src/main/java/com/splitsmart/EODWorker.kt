package com.splitsmart

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * WorkManager Worker that triggers the JS EOD sync job via React Native's
 * DeviceEventManager. When the app is in the foreground/background (process
 * alive), it emits an event that JS can respond to. When the process is dead,
 * the event is queued to fire on next launch (handled by eodCatchup.ts instead).
 */
class EODWorker(appContext: Context, workerParams: WorkerParameters) :
    Worker(appContext, workerParams) {

  override fun doWork(): Result {
    return try {
      val reactContext = getReactContext()
      if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit("SplitSmartEODJob", null)
      }
      Result.success()
    } catch (e: Exception) {
      Result.retry()
    }
  }

  private fun getReactContext(): ReactContext? {
    return try {
      val app = applicationContext as? MainApplication ?: return null
      app.reactHost.currentReactContext
    } catch (e: Exception) {
      null
    }
  }
}
