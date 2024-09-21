require('dotenv').config();

const express = require('express');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const app = express();
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Guardian API',
      version: '1.0.0',
      description: 'API documentation with Swagger UI and Redoc'
    }
  },
  apis: ['./src/routes/*.js']
};


const swaggerSpec = swaggerJsdoc(swaggerOptions);


// Set up EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


const userRoutes = require('./routes/user');
const wifiCSIRoutes = require('./routes/wifiCSI');
const activityRecognitionRoutes = require('./routes/activityRecognition');
const alertsRoutes = require('./routes/alerts');
const roleRoutes = require('./routes/role');
const adminRoutes = require('./routes/admin'); 
const checkUserRoleRoutes = require('./routes/checkUserRole'); 


app.use('/api/users', userRoutes);
app.use('/api/wifi-csi', wifiCSIRoutes);
app.use('/api/activity-recognition', activityRecognitionRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api', roleRoutes);
app.use('/api/admin', adminRoutes); 
app.use('/api', checkUserRoleRoutes); 
app.use('/docs2', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/caretaker", adminRoutes);
app.use("/api/v1/nurse", adminRoutes);


app.get('/docs1', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Guardian Monitor APIs</title>
        <!-- Include the Redoc script -->
        <script src="https://cdn.jsdelivr.net/npm/redoc@latest/bundles/redoc.standalone.js"></script>
      </head>
      <body>
        <redoc spec-url="/openapi.json"></redoc> <!-- Specify OpenAPI spec URL -->
        <script>
          Redoc.init('/openapi.json', {}, document.querySelector('redoc'));
        </script>
      </body>
    </html>
  `);
});

app.get('/openapi.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.json'));
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;