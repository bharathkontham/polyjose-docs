// See settings.gradle.kts. kotlin.sh passes:
//   -Ppolyjose.jvmJar=<path>     the polyjose-jvm jar it built from the pinned commit
//   -Psamples.buildDir=<path>    build output, kept under samples/.polyjose
plugins {
    alias(libs.plugins.kotlin.jvm)
}

layout.buildDirectory = file(providers.gradleProperty("samples.buildDir").getOrElse("build"))

kotlin {
    // The JDK polyjose's own Kotlin build uses.
    jvmToolchain(21)
}

val polyjoseJar = providers.gradleProperty("polyjose.jvmJar")
    .orElse(provider { throw GradleException("pass -Ppolyjose.jvmJar=<jar>; scripts/samples/run.sh kotlin does") })

dependencies {
    // dev.polyjose:polyjose-jvm, as a file until it is published. JNA is what its POM will declare.
    testImplementation(files(polyjoseJar))
    testImplementation(libs.jna)

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
    // Reads samples/fixtures/keys.json; never shown on a page.
    testImplementation(libs.org.json)
}

tasks.test {
    useJUnitPlatform()
    val keys = layout.projectDirectory.file("../fixtures/keys.json").asFile
    inputs.file(keys).withPropertyName("keys").withPathSensitivity(PathSensitivity.NONE)
    systemProperty("samples.keys", keys.path)
    testLogging {
        events("passed", "skipped", "failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
