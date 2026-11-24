import { createNavigationContainerRef } from '@react-navigation/native';

/** Lets non-screen components (e.g. the ride-request overlay) navigate. */
export const navigationRef = createNavigationContainerRef<any>();
