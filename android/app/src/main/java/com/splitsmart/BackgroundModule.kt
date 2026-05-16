package com.splitsmart

import android.content.Context
import androidx.work.*
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.TimeUnit

/**
 * React Native native module that exposes WorkManager scheduling to JS.
 * JS can call BackgroundJob.scheduleEODJob() to set up a nightly background
 * worker and BackgroundJob.cancelEODJob() to remove it.
 */
class BackgroundModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val JOB_TAG = "SplitSmartEODJob"
  }

  override fun getName(): String = "BackgroundJob"

  @ReactMethod
  fun scheduleEODJob(promise: Promise) {
    try {
      val constraints = Constraints.Builder()
          .setRequiredNetworkType(NetworkType.CONNECTED)
          .build()

      // Run nightly, starting ~23:00 with a 1-hour flex window
      val request = PeriodicWorkRequestBuilder<EODWorker>(
          repeatInterval = 24,
          repeatIntervalTimeUnit = TimeUnit.HOURS,
          flexTimeInterval = 60,
          flexTimeIntervalUnit = TimeUnit.MINUTES
      )
          .setConstraints(constraints)
          .addTag(JOB_TAG)
          .build()

      WorkManager.getInstance(reactApplicationContext)
          .enqueueUniquePeriodicWork(
              JOB_TAG,
              ExistingPeriodicWorkPolicy.KEEP,
              request
          )

      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SCHEDULE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun cancelEODJob(promise: Promise) {
    try {
      WorkManager.getInstance(reactApplicationContext).cancelAllWorkByTag(JOB_TAG)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("CANCEL_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun getWorkStatus(promise: Promise) {
    try {
      val workInfos = WorkManager.getInstance(reactApplicationContext)
          .getWorkInfosByTag(JOB_TAG)
          .get()
      val status = if (workInfos.isNullOrEmpty()) "not_scheduled" else workInfos[0].state.name
      promise.resolve(status)
    } catch (e: Exception) {
      promise.reject("STATUS_ERROR", e.message, e)
    }
  }
}
