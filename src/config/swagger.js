// src/config/swagger.js
import swaggerJSDoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Laporan Keuangan API',
      version: '1.0.0',
      description:
        'API untuk auth, produk, dan keuangan (laporan, laba-rugi, arus kas). Aturan: debit=pemasukan, kredit=pengeluaran.',
    },
    servers: [{ url: 'http://localhost:3000/api' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Produk: {
          type: 'object',
          properties: {
            produk_id: { type: 'integer' },
            nama: { type: 'string' },
            kategori_id: { type: 'integer', nullable: true },
            harga: { type: 'integer' },
            created_by: { type: 'string', format: 'uuid', nullable: true },
          },
        },
        securitySchemes: {
            BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        },
        LaporanKeuangan: {
        type: 'object',
        properties: {
            id_laporan: { type: 'string', format: 'uuid' },
            id_user:    { type: 'string', format: 'uuid' },
            created_at: { type: 'string', format: 'date-time' },
            jenis:      { type: 'string', enum: ['pemasukan','pengeluaran'] },
            kategori_id:{ type: 'integer' },
            deskripsi:  { type: 'string', nullable: true },
            debit:      { type: 'integer' },
            kredit:     { type: 'integer' }
        }
        },
        DetailLaporanItem: {
        type: 'object',
        required: ['produk_id','jumlah'],
        properties: {
            id_detail: { type: 'integer', nullable: true },
            laporan_id:{ type: 'string', format: 'uuid', nullable: true },
            produk_id: { type: 'integer' },
            jumlah:    { type: 'integer', example: 10 },
            subtotal:  { type: 'integer', example: 120000 },
            produk: {
            type: 'object',
            nullable: true,
            properties: {
                nama:  { type: 'string', example: 'Beras IR64 Premium' },
                harga: { type: 'integer', example: 12000 }
            }
            }
        }
        },
        UserPublic: {
            type: 'object',
            properties: {
            user_id: { type: 'string', format: 'uuid' },
            nama: { type: 'string' },
            email: { type: 'string', format: 'email' },
            nomor_telepon: { type: 'string', nullable: true },
            role: { type: 'string', enum: ['user','admin','superadmin'] },
            klaster_id: { type: 'integer', nullable: true },
            created_at: { type: 'string', format: 'date-time' }
            }
        },
        AuthLoginBody: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
          },
        },
        AuthLoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                user_id: { type: 'string', format: 'uuid' },
                nama: { type: 'string' },
                username: { type: 'string' },
                role: { type: 'string', enum: ['user', 'admin', 'superadmin'] },
              },
            },
          },
        },
      },
    },
  },
  apis: [
    './src/routes/*.js',     
  ],
};

export const swaggerSpec = swaggerJSDoc(options);
