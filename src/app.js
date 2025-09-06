import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';

// swagger
import swaggerUi from 'swagger-ui-express';
import {swaggerSpec} from './config/swagger.js';

const app = express();
app.use(cors());
app.use(express.json());

// route swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
app.get('/', (req, res) => res.redirect(302, '/api-docs'));

// route api
app.use('/api', routes);

export default app;
