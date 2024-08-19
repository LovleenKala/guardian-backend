# guardian-backend
This repository hosts the source code for the Guardian backend API.

To update the README file with the changes from PostgreSQL to MongoDB, and reflecting the new endpoints and authentication details, here's the revised content:

```markdown
# Guardian System Management API

The guardian system Management API provides functionalities 

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- Node.js (v14 or later recommended)
- Docker and Docker Compose
- MongoDB (Local or Remote Instance)
- Postman (For API Testing)

### Installation

1. Clone the repository to your local machine:
   ```bash
   git clone  https://github.com/Gopher-Industries/guardian-backend.git
   ```

2. Navigate into the project directory:
   ```bash
   cd guardian-backend
   ```

3. Set up environment variables by creating a `.env` file in the project root:
   ```bash
   touch .env
   ```
   Add the following environment variables to the `.env` file:
   ```plaintext
   MONGODB_URL=mongodb://localhost:27017/guardian
   PORT=3000
   NODE_ENV=development
   ```

4. Start the application with Docker:
   ```bash
   docker-compose up --build
   ```

5. The API will be available at `http://localhost:3000`.

### Project Structure

```
guardian-backend/
│
├── config/               # Configuration files (MongoDB connection)
│   └── db.js
├── models/               # MongoDB schemas (Mongoose models)
│   ├── User.js
│   ├── UserRole.js
│   ├── WifiCSI.js
│   ├── ActivityRecognition.js
│   ├── Alert.js
│   └── Notification.js
├── routes/               # API route handlers
│   ├── user.js
│   ├── wifiCSI.js
│   ├── activityRecognition.js
│   └── alerts.js
├── .env                  # Environment variables
├── server.js             # Main server file
└── package.json          # Dependencies and scripts
```

### API Endpoints

#### User Management

- **POST** `/api/users` - Create a new user
- **GET** `/api/users` - Get all users

#### Wi-Fi CSI Data Management

- **POST** `/api/wifi-csi` - Create a new Wi-Fi CSI record
- **GET** `/api/wifi-csi` - Get all Wi-Fi CSI records

#### Activity Recognition

- **POST** `/api/activity-recognition` - Create a new activity recognition record
- **GET** `/api/activity-recognition` - Get all activity recognition records

#### Alerts and Notifications

- **POST** `/api/alerts` - Create a new alert
- **GET** `/api/alerts` - Get all alerts

### Testing

To test the API, use Postman or similar API testing tools.

1. **Start the server** using the Docker Compose command mentioned above.
2. **Use Postman** to send HTTP requests to the API endpoints. Examples:
   - **POST** `/api/users`
   - **GET** `/api/users`
   - **POST** `/api/wifi-csi`
   - **GET** `/api/wifi-csi`
   - **POST** `/api/activity-recognition`
   - **GET** `/api/activity-recognition`
   - **POST** `/api/alerts`
   - **GET** `/api/alerts`

### Environment Variables

- `MONGODB_URL`: The MongoDB connection string.
- `PORT`: The port on which the application runs (default: 3000).
- `NODE_ENV`: The environment in which the app is running (e.g., `development`).

### Built With

- **Node.js** - The runtime environment
- **Express** - The web framework used
- **Mongoose** - MongoDB object modeling for Node.js
- **Docker** - Containerization for the application


### Acknowledgments

- Special thanks to the development team and contributors.

```

### What’s Covered:
- **Project Setup**: Instructions for cloning, setting up environment variables, and running the project.
- **Project Structure**: Explanation of how the files and directories are organized.
- **API Endpoints**: Overview of all the API routes and their functionality.
- **Testing**: Instructions on how to test the API using Postman.
- **Environment Variables**: Key configurations like MongoDB URL and PORT.
