"""Deterministically generate the native Xcode project and pinned package references.

Run from any directory with Python 3. No Xcode, Ruby or package download required.
The generated project is committed; cloud builds consume it directly.
"""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "apps" / "ios"
PROJECT = IOS / "CryptoCardDemo.xcodeproj"
objects = {}
PACKAGE_PINS = json.loads((IOS / "swift-package-pins.json").read_text(encoding="utf-8"))["packages"]


def ident(key):
    return hashlib.sha256(key.encode()).hexdigest()[:24].upper()


def add(key, isa, **fields):
    uid = ident(key)
    objects[uid] = {"isa": isa, **fields}
    return uid


def encode(value, depth=0):
    pad = "\t" * depth
    if isinstance(value, dict):
        return "{\n" + "".join(f'{pad}\t{json.dumps(k)} = {encode(v, depth + 1)};\n' for k, v in value.items()) + pad + "}"
    if isinstance(value, list):
        return "(\n" + "".join(f'{pad}\t{encode(v, depth + 1)},\n' for v in value) + pad + ")"
    return json.dumps(str(value))


def configurations(key, settings):
    configs = []
    for name in ["Debug", "Release"]:
        values = dict(settings)
        values.update({"SWIFT_OPTIMIZATION_LEVEL": "-Onone" if name == "Debug" else "-O",
                       "DEBUG_INFORMATION_FORMAT": "dwarf" if name == "Debug" else "dwarf-with-dsym"})
        if name == "Debug":
            values["SWIFT_ACTIVE_COMPILATION_CONDITIONS"] = "DEBUG"
        configs.append(add(f"{key}.{name}", "XCBuildConfiguration", name=name, buildSettings=values))
    return add(f"{key}.configlist", "XCConfigurationList", buildConfigurations=configs,
               defaultConfigurationIsVisible="0", defaultConfigurationName="Release")


def make_target(name, folder, product_type, extension, settings, dependency=False):
    references, sources, resources = [], [], []
    for path in sorted((IOS / folder).glob("*.swift")):
        ref = add(f"file.{folder}.{path.name}", "PBXFileReference", lastKnownFileType="sourcecode.swift", path=path.name, sourceTree="<group>")
        references.append(ref)
        sources.append(add(f"build.{folder}.{path.name}", "PBXBuildFile", fileRef=ref))
    if name == "CryptoCardDemo":
        app_resources = [("Assets.xcassets", "folder.assetcatalog"), ("Localizable.xcstrings", "text.json.xcstrings"),
                         ("Info.plist", "text.plist.xml"), ("CryptoCardDemo.entitlements", "text.plist.entitlements"),
                         ("ThirdPartyNotices", "folder"), ("Fonts", "folder")]
        # Explicit configuration is supplied separately; never generate a project ID,
        # network, API origin or App Group merely to make a build look configured.
        if (IOS / folder / "WalletIntegration.plist").is_file():
            app_resources.append(("WalletIntegration.plist", "text.plist.xml"))
        for filename, filetype in app_resources:
            ref = add(f"file.{filename}", "PBXFileReference", lastKnownFileType=filetype, path=filename, sourceTree="<group>")
            references.append(ref)
            if filename not in ("Info.plist", "CryptoCardDemo.entitlements"):
                resources.append(add(f"build.{filename}", "PBXBuildFile", fileRef=ref))
    group = add(f"group.{folder}", "PBXGroup", path=folder, sourceTree="<group>", children=references)
    product = add(f"product.{name}", "PBXFileReference", explicitFileType="wrapper.application" if extension == "app" else "wrapper.cfbundle",
                  includeInIndex="0", path=f"{name}.{extension}", sourceTree="BUILT_PRODUCTS_DIR")
    package_products, frameworks = [], []
    if name == "CryptoCardDemo":
        for package in PACKAGE_PINS:
            for product_name in package["products"]:
                product_ref = add(f"package.product.{product_name}", "XCSwiftPackageProductDependency",
                                  package=ident(f"package.{package['identity']}"), productName=product_name)
                package_products.append(product_ref)
                frameworks.append(add(f"package.build.{product_name}", "PBXBuildFile", productRef=product_ref))
    phases = [add(f"sources.{name}", "PBXSourcesBuildPhase", buildActionMask="2147483647", files=sources, runOnlyForDeploymentPostprocessing="0"),
              add(f"frameworks.{name}", "PBXFrameworksBuildPhase", buildActionMask="2147483647", files=frameworks, runOnlyForDeploymentPostprocessing="0"),
              add(f"resources.{name}", "PBXResourcesBuildPhase", buildActionMask="2147483647", files=resources, runOnlyForDeploymentPostprocessing="0")]
    deps = []
    if dependency:
        proxy = add(f"proxy.{name}", "PBXContainerItemProxy", containerPortal=ident("project"), proxyType="1",
                    remoteGlobalIDString=ident("target.CryptoCardDemo"), remoteInfo="CryptoCardDemo")
        deps.append(add(f"dependency.{name}", "PBXTargetDependency", target=ident("target.CryptoCardDemo"), targetProxy=proxy))
    target = add(f"target.{name}", "PBXNativeTarget", name=name, productName=name, productReference=product,
                 productType=product_type, buildConfigurationList=configurations(name, settings), buildPhases=phases,
                 buildRules=[], dependencies=deps, packageProductDependencies=package_products)
    return group, product, target


common = {"SWIFT_VERSION": "5.0", "IPHONEOS_DEPLOYMENT_TARGET": "17.0", "SDKROOT": "iphoneos",
          "TARGETED_DEVICE_FAMILY": "1", "CODE_SIGN_STYLE": "Automatic", "SUPPORTED_PLATFORMS": "iphoneos iphonesimulator",
          "CLANG_ENABLE_MODULES": "YES", "ENABLE_USER_SCRIPT_SANDBOXING": "YES", "SWIFT_EMIT_LOC_STRINGS": "YES",
          # Release builds override CURRENT_PROJECT_VERSION with the CI build number and pass DEVELOPMENT_TEAM.
          "MARKETING_VERSION": "1.0", "CURRENT_PROJECT_VERSION": "1"}
app = make_target("CryptoCardDemo", "CryptoCardDemo", "com.apple.product-type.application", "app",
                  {**common, "PRODUCT_BUNDLE_IDENTIFIER": "com.noklith.app", "PRODUCT_NAME": "$(TARGET_NAME)",
                   "INFOPLIST_FILE": "CryptoCardDemo/Info.plist", "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "AccentColor",
                   "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
                   # App Group group.com.noklith.app: Reown keeps its session in this shared keychain/defaults group.
                   "CODE_SIGN_ENTITLEMENTS": "CryptoCardDemo/CryptoCardDemo.entitlements",
                   # Release signing (scripts/ci/testflight.sh) sets APP_*; they reach only this target, not Swift packages.
                   "CODE_SIGN_STYLE": "$(APP_CODE_SIGN_STYLE:default=Automatic)",
                   "CODE_SIGN_IDENTITY": "$(APP_CODE_SIGN_IDENTITY:default=Apple Development)",
                   "PROVISIONING_PROFILE_SPECIFIER": "$(APP_PROVISIONING_PROFILE)",
                   "LD_RUNPATH_SEARCH_PATHS": ["$(inherited)", "@executable_path/Frameworks"], "ENABLE_PREVIEWS": "YES"})
ui = make_target("CryptoCardDemoUITests", "CryptoCardDemoUITests", "com.apple.product-type.bundle.ui-testing", "xctest",
                 {**common, "PRODUCT_BUNDLE_IDENTIFIER": "com.noklith.app.uitests", "PRODUCT_NAME": "$(TARGET_NAME)",
                  "GENERATE_INFOPLIST_FILE": "YES", "TEST_TARGET_NAME": "CryptoCardDemo"}, dependency=True)
unit = make_target("CryptoCardDemoTests", "CryptoCardDemoTests", "com.apple.product-type.bundle.unit-test", "xctest",
                   {**common, "PRODUCT_BUNDLE_IDENTIFIER": "com.noklith.app.tests", "PRODUCT_NAME": "$(TARGET_NAME)",
                    "GENERATE_INFOPLIST_FILE": "YES", "TEST_HOST": "$(BUILT_PRODUCTS_DIR)/CryptoCardDemo.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/CryptoCardDemo",
                    "BUNDLE_LOADER": "$(TEST_HOST)"}, dependency=True)
products = add("group.products", "PBXGroup", name="Products", sourceTree="<group>", children=[app[1], ui[1], unit[1]])
main_group = add("group.main", "PBXGroup", sourceTree="<group>", children=[app[0], ui[0], unit[0], products])
package_references = [add(f"package.{package['identity']}", "XCRemoteSwiftPackageReference",
                          repositoryURL=package["url"], requirement={"kind": "revision", "revision": package["revision"]})
                      for package in PACKAGE_PINS]
add("project", "PBXProject", attributes={"LastUpgradeCheck": "1640", "BuildIndependentTargetsInParallel": "YES",
    "TargetAttributes": {app[2]: {"CreatedOnToolsVersion": "16.4"}, ui[2]: {"CreatedOnToolsVersion": "16.4", "TestTargetID": app[2]},
                         unit[2]: {"CreatedOnToolsVersion": "16.4", "TestTargetID": app[2]}}},
    buildConfigurationList=configurations("project", {"CLANG_ENABLE_MODULES": "YES", "IPHONEOS_DEPLOYMENT_TARGET": "17.0",
       "ENABLE_TESTABILITY": "YES", "SWIFT_VERSION": "5.0"}), compatibilityVersion="Xcode 14.0", developmentRegion="en",
    hasScannedForEncodings="0", knownRegions=["en", "Base"], mainGroup=main_group, productRefGroup=products,
    projectDirPath="", projectRoot="", targets=[app[2], ui[2], unit[2]], packageReferences=package_references)
PROJECT.mkdir(parents=True, exist_ok=True)
content = {"archiveVersion": "1", "classes": {}, "objectVersion": "56", "objects": objects, "rootObject": ident("project")}
(PROJECT / "project.pbxproj").write_text("// !$*UTF8*$!\n" + encode(content) + "\n", encoding="utf-8")


def reference(name, extension):
    return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{ident("target." + name)}" BuildableName="{name}.{extension}" BlueprintName="{name}" ReferencedContainer="container:CryptoCardDemo.xcodeproj"/>'


scheme = f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1640" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries>
<BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{reference("CryptoCardDemo", "app")}</BuildActionEntry>
</BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES">
<Testables><TestableReference skipped="NO">{reference("CryptoCardDemoTests", "xctest")}</TestableReference><TestableReference skipped="NO">{reference("CryptoCardDemoUITests", "xctest")}</TestableReference></Testables>
</TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES">
<BuildableProductRunnable runnableDebuggingMode="0">{reference("CryptoCardDemo", "app")}</BuildableProductRunnable>
</LaunchAction>
<ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference("CryptoCardDemo", "app")}</BuildableProductRunnable></ProfileAction>
<AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
'''
schemes = PROJECT / "xcshareddata" / "xcschemes"
schemes.mkdir(parents=True, exist_ok=True)
(schemes / "CryptoCardDemo.xcscheme").write_text(scheme, encoding="utf-8")
print(f"Generated {PROJECT}: {len(objects)} objects, app + unit + UI test targets")
