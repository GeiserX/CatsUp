// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CatsUp",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "CatsUp", targets: ["CatsUp"])
    ],
    targets: [
        .executableTarget(
            name: "CatsUp",
            path: ".",
            exclude: ["Package.swift", "Tests"],
            resources: []
        ),
        .testTarget(
            name: "CatsUpTests",
            dependencies: ["CatsUp"],
            path: "Tests"
        )
    ]
)
