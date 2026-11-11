// See settings.gradle.kts. kotlin.sh passes:
//   -Ppolyjose.jvmJar=<path>     git pin: the polyjose-jvm jar it built from the pinned commit
//   -Ppolyjose.version=<version> registry pin: dev.polyjose:polyjose-jvm at that version, from Maven Central
//   -Psamples.buildDir=<path>    build output, kept under samples/.polyjose
plugins {
    alias(libs.plugins.kotlin.jvm)
}

layout.buildDirectory = file(providers.gradleProperty("samples.buildDir").getOrElse("build"))

kotlin {
    // The JDK polyjose's own Kotlin build uses.
    jvmToolchain(21)
}

val polyjoseVersion = providers.gradleProperty("polyjose.version")
val polyjoseJar = providers.gradleProperty("polyjose.jvmJar")
    .orElse(provider { throw GradleException("pass -Ppolyjose.jvmJar=<jar> or -Ppolyjose.version=<version>; scripts/samples/run.sh kotlin does") })

dependencies {
    if (polyjoseVersion.isPresent) {
        // The published artifact, with the dependencies its own POM declares (JNA).
        testImplementation("dev.polyjose:polyjose-jvm:${polyjoseVersion.get()}")
    } else {
        // dev.polyjose:polyjose-jvm, as a file so the samples run against the pinned commit. JNA is what its POM declares.
        testImplementation(files(polyjoseJar))
        testImplementation(libs.jna)
    }

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
    // Reads samples/fixtures/keys.json; never shown on a page.
    testImplementation(libs.org.json)
    // The "before" side of Migrate from Nimbus JOSE + JWT (MigrateNimbusTest.kt), pinned exactly.
    // Its POM declares only optional dependencies (BouncyCastle, Tink), and the samples use none.
    testImplementation("com.nimbusds:nimbus-jose-jwt:10.10")
}

tasks.test {
    useJUnitPlatform()
    val keys = layout.projectDirectory.file("../fixtures/keys.json").asFile
    // Every fixture file is an input, so editing any of them re-runs the tests.
    inputs.dir(keys.parentFile).withPropertyName("fixtures").withPathSensitivity(PathSensitivity.RELATIVE)
    systemProperty("samples.keys", keys.path)
    testLogging {
        events("passed", "skipped", "failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
