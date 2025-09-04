#import <Capacitor/Capacitor.h>

// Registers the Swift plugin RevCatUIPaywall with Capacitor
CAP_PLUGIN(RevCatUIPaywall, "RevCatUIPaywall",
           CAP_PLUGIN_METHOD(show, CAPPluginReturnPromise);
)


