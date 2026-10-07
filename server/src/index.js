import 'dotenv/config';
import { createServer } from 'node:http';
import app from './app.js';
import { connectDB } from './db.js';

const PORT = process.env.PORT || 8000;
const server = createServer(app);

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port: ${PORT}`);
  });
});
