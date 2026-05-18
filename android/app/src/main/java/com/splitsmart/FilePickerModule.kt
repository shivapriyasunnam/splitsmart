package com.splitsmart

import android.app.Activity
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Opens Android's system file picker restricted to JSON files and returns
 * the file content as a string. Uses ActivityEventListener so it works
 * within React Native's activity lifecycle.
 */
class FilePickerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val REQUEST_CODE = 7481
    }

    private var pendingPromise: Promise? = null

    private val activityEventListener: ActivityEventListener =
        object : BaseActivityEventListener() {
            override fun onActivityResult(
                activity: Activity,
                requestCode: Int,
                resultCode: Int,
                data: Intent?,
            ) {
                if (requestCode != REQUEST_CODE) return
                val promise = pendingPromise ?: return
                pendingPromise = null

                if (resultCode != Activity.RESULT_OK || data == null) {
                    // User cancelled — resolve with null so JS can check
                    promise.resolve(null)
                    return
                }

                val uri: Uri = data.data ?: run {
                    promise.reject("NO_URI", "No file URI returned from picker")
                    return
                }

                try {
                    val content = reactApplicationContext.contentResolver
                        .openInputStream(uri)
                        ?.bufferedReader()
                        ?.use { it.readText() }
                        ?: throw Exception("Could not open file stream")
                    promise.resolve(content)
                } catch (e: Exception) {
                    promise.reject("READ_FAILED", e.message ?: "Failed to read file", e)
                }
            }
        }

    init {
        reactContext.addActivityEventListener(activityEventListener)
    }

    override fun getName(): String = "FilePickerModule"

    @ReactMethod
    fun pickJsonFile(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }
        pendingPromise = promise
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/json"
        }
        activity.startActivityForResult(intent, REQUEST_CODE)
    }
}
