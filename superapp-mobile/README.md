# SuperApp Mobile

A production-quality React Native super app built with Expo, featuring modular architecture for Food Delivery, Grocery, Cab Booking, and Salon Services.

## Architecture Overview

```
superapp-mobile/
├── src/
│   ├── modules/           # Feature modules
│   │   ├── food/          # Food Delivery (Phase 1)
│   │   ├── grocery/       # Grocery (Phase 1)
│   │   ├── cab/           # Cab Booking (Phase 2)
│   │   ├── salon/         # Salon Services (Phase 3)
│   │   ├── home/          # Home screen
│   │   ├── cart/          # Unified cart
│   │   ├── orders/        # Order history
│   │   └── profile/       # User profile
│   ├── shared/            # Shared resources
│   │   ├── components/    # Reusable UI components
│   │   ├── navigation/    # Navigation setup
│   │   ├── services/      # API & storage services
│   │   ├── store/         # Zustand store utilities
│   │   ├── theme/         # Colors, typography, spacing
│   │   └── utils/         # Helper functions
│   ├── auth/              # Authentication
│   │   ├── screens/       # Splash, Login, OTP
│   │   └── store/         # Auth store
│   ├── App.tsx            # Entry point
│   └── moduleRegistry.ts  # Module registration
├── assets/                # Images, fonts
├── package.json
├── tsconfig.json
└── babel.config.js
```

## Tech Stack

- **Framework**: React Native (Expo SDK 51)
- **Navigation**: React Navigation v6
- **State Management**: Zustand (with persistence)
- **Styling**: Styled Components
- **HTTP Client**: Axios
- **Storage**: AsyncStorage
- **Maps**: React Native Maps
- **Payments**: Razorpay
- **UI Components**: React Native Paper

## Features

### Phase 1 (MVP) - Food & Grocery
- [x] JWT + OTP Authentication
- [x] Restaurant listings with ratings
- [x] Menu browsing with categories
- [x] Cart management with quantity controls
- [x] Product catalog for grocery
- [x] Unified cart across modules
- [x] Order tracking
- [x] Profile management

### Phase 2 - Cab Booking
- [x] Google Maps integration
- [x] Real-time driver tracking
- [x] Fare estimation
- [x] Ride booking flow

### Phase 3 - Salon Services
- [x] Salon listings
- [x] Service catalog
- [x] Slot booking
- [x] Stylist selection

## Module Registry Pattern

Each module exports a `ModuleConfig` object that registers:
- `id`: Unique module identifier
- `name`: Display name
- `icon`: Icon name
- `color`: Brand color
- `HomeCard`: Component for home screen
- `navigator`: Stack navigator
- `enabled`: Feature flag

Adding a new module only requires registration in `moduleRegistry.ts`.

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g @expo/cli`)

### Installation

**Windows:**
```bash
setup.bat
```

**macOS/Linux:**
```bash
chmod +x setup.sh
./setup.sh
```

Or manually:
```bash
npm install
```

### Running the App

```bash
# Start development server
npm start

# Run on Android
npm run android

# Run on iOS (macOS only)
npm run ios

# Run on web
npm run web
```

## API Configuration

Create a `.env` file in the root:

```env
EXPO_PUBLIC_API_URL=https://your-api-url.com
EXPO_PUBLIC_RAZORPAY_KEY=your_razorpay_key
EXPO_PUBLIC_GOOGLE_MAPS_KEY=your_maps_key
```

## Navigation Structure

```
RootNavigator
├── AuthStack (unauthenticated)
│   ├── SplashScreen
│   ├── LoginScreen
│   └── OTPVerifyScreen
└── MainStack (authenticated)
    ├── BottomTabNavigator
    │   ├── HomeTab → HomeScreen
    │   ├── OrdersTab → OrderHistoryScreen
    │   ├── CartTab → UnifiedCartScreen
    │   └── ProfileTab → ProfileScreen
    ├── FoodStack
    ├── GroceryStack
    ├── CabStack
    └── SalonStack
```

## State Management

### Stores
- `authStore`: User authentication
- `cartStore`: Unified shopping cart
- `foodStore`: Restaurant & menu data
- `groceryStore`: Categories & products
- `orderStore`: Order history & tracking
- `locationStore`: Current location

### Cart Logic
The cart maintains a `moduleType` field. Adding items from a different module triggers a warning to clear the existing cart.

## Theming

Centralized theme in `src/shared/theme/`:
- `colors.ts`: Brand & semantic colors
- `typography.ts`: Font styles
- `spacing.ts`: Layout constants

## Components

### Shared Components
- `AppButton`: Multi-variant button
- `AppInput`: Labeled input with validation
- `Card`: Elevated/outlined/filled containers
- `ProductCard`: Grocery item display
- `RestaurantCard`: Restaurant listing card
- `OrderStatusBadge`: Status indicator
- `EmptyState`: Empty list placeholder
- `SkeletonLoader`: Loading placeholders

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo development server |
| `npm run android` | Run on Android emulator/device |
| `npm run ios` | Run on iOS simulator/device |
| `npm run web` | Run in web browser |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript check |

## Contributing

1. Create a feature branch: `git checkout -b feature/module-name`
2. Implement your changes
3. Run linting: `npm run lint`
4. Submit a pull request

## License

MIT
