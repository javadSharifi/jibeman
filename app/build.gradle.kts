import java.util.concurrent.TimeUnit

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

fun runGitCommand(vararg args: String): String {
    return try {
        val process = ProcessBuilder(*args)
            .directory(project.rootDir)
            .redirectOutput(ProcessBuilder.Redirect.PIPE)
            .redirectError(ProcessBuilder.Redirect.PIPE)
            .start()
        process.waitFor(5, TimeUnit.SECONDS)
        process.inputStream.bufferedReader().readText().trim()
    } catch (_: Throwable) {
        ""
    }
}

fun readWebPackageVersion(): String {
    return try {
        val pkgFile = file("../web/package.json")
        if (!pkgFile.exists()) return ""
        val match = Regex(""""version"\s*:\s*"([^"]+)"""").find(pkgFile.readText())
        match?.groupValues?.getOrNull(1)?.trim()?.removePrefix("v") ?: ""
    } catch (_: Throwable) {
        ""
    }
}

fun resolveVersionName(): String {
    val prop = findProperty("versionName") as? String
    if (!prop.isNullOrBlank()) return prop.removePrefix("v")
    val env = System.getenv("VERSION_NAME")
    if (!env.isNullOrBlank()) return env.removePrefix("v")
    val gitTag = runGitCommand("git", "describe", "--tags", "--abbrev=0").removePrefix("v")
    if (gitTag.isNotBlank()) return gitTag
    val pkgVer = readWebPackageVersion()
    return if (pkgVer.isNotBlank()) pkgVer else "0.1.0"
}

fun resolveVersionCode(vName: String): Int {
    val prop = (findProperty("versionCode") as? String)?.toIntOrNull()
    if (prop != null && prop > 0) return prop
    val env = System.getenv("VERSION_CODE")?.toIntOrNull()
    if (env != null && env > 0) return env
    val gitCount = runGitCommand("git", "rev-list", "--count", "HEAD").toIntOrNull()
    if (gitCount != null && gitCount > 0) return gitCount

    val parts = vName.split(".").mapNotNull { part ->
        part.takeWhile { it.isDigit() }.toIntOrNull()
    }
    val major = parts.getOrNull(0) ?: 0
    val minor = parts.getOrNull(1) ?: 1
    val patch = parts.getOrNull(2) ?: 0
    return major * 10000 + minor * 100 + patch
}

val appVersionName = resolveVersionName()
val appVersionCode = resolveVersionCode(appVersionName)

tasks.register("printVersion") {
    doLast {
        println("APP_VERSION_NAME=$appVersionName")
        println("APP_VERSION_CODE=$appVersionCode")
    }
}

android {
    namespace = "ir.jibeman"
    compileSdk = 36

    signingConfigs {
        create("release") {
            val keystoreFile = file("release.keystore")
            if (keystoreFile.exists()) {
                storeFile = keystoreFile
                storePassword = System.getenv("KEYSTORE_PASSWORD") ?: "jibeman123456"
                keyAlias = System.getenv("KEY_ALIAS") ?: "jibeman"
                keyPassword = System.getenv("KEY_PASSWORD") ?: "jibeman123456"
                enableV1Signing = true
                enableV2Signing = true
            } else {
                val debugConfig = getByName("debug")
                storeFile = debugConfig.storeFile
                storePassword = debugConfig.storePassword
                keyAlias = debugConfig.keyAlias
                keyPassword = debugConfig.keyPassword
            }
        }
    }

    defaultConfig {
        applicationId = "ir.jibeman"
        minSdk = 24
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName
        // real phones are ARM; x86 builds of SQLCipher would add ~13 MB for emulators only
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
ksp { arg("room.schemaLocation", "$projectDir/schemas") }

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.06.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.12.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.room:room-runtime:2.8.4")
    implementation("androidx.room:room-ktx:2.8.4")
    ksp("androidx.room:room-compiler:2.8.4")
    implementation("net.zetetic:sqlcipher-android:4.12.0@aar")
    implementation("androidx.sqlite:sqlite:2.6.2")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.fragment:fragment:1.8.9") // Activity Result support for the backup file picker
    implementation("org.bouncycastle:bcprov-jdk18on:1.87") // PBKDF2-HMAC-SHA256 also on Android 24 and 25
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517") // real org.json for JVM tests (android.jar only has stubs)
}
