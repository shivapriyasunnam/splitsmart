package com.splitsmart

import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream

/**
 * Saves a text/JSON file to the user's Downloads folder.
 *
 * Android 10+ (API 29+): Uses MediaStore.Downloads so no runtime permission
 * is required under scoped storage.
 *
 * Android 9 and below (API < 29): Falls back to a direct FileOutputStream write
 * to the public Downloads directory (requires WRITE_EXTERNAL_STORAGE, declared
 * in AndroidManifest.xml with maxSdkVersion="28").
 */
class DownloadModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DownloadModule"

    @ReactMethod
    fun saveToDownloads(filename: String, content: String, mimeType: String, promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // API 29+: MediaStore — no WRITE permission needed
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, filename)
                    put(MediaStore.Downloads.MIME_TYPE, mimeType)
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = reactApplicationContext.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: throw Exception("MediaStore could not create file in Downloads")

                resolver.openOutputStream(uri)?.use { stream ->
                    stream.write(content.toByteArray(Charsets.UTF_8))
                }

                // Clear IS_PENDING so the file is visible to other apps
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } else {
                // API < 29: direct write (WRITE_EXTERNAL_STORAGE declared in manifest)
                val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                val file = File(dir, filename)
                FileOutputStream(file).use { stream ->
                    stream.write(content.toByteArray(Charsets.UTF_8))
                }
            }
            promise.resolve(filename)
        } catch (e: Exception) {
            promise.reject("DOWNLOAD_FAILED", e.message ?: "Failed to save file", e)
        }
    }
}
