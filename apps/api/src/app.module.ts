import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AppController } from './app.controller.js';
import { AuditInterceptor } from './audit/audit.interceptor.js';
import { AuditLogModule } from './audit/audit-log.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { CsrfGuard } from './auth/csrf.guard.js';
import { CommitteeModule } from './committee/committee.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { ConfigModule } from './config/config.module.js';
import { ENV, type Env } from './config/env.js';
import { FinanceModule } from './finance/finance.module.js';
import { BillingModule } from './billing/billing.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { DonationsModule } from './donations/donations.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { OverviewModule } from './overview/overview.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { FormsModule } from './forms/forms.module.js';
import { GalleryModule } from './gallery/gallery.module.js';
import { MembersModule } from './members/members.module.js';
import { NoticesModule } from './notices/notices.module.js';
import { PermissionsGuard } from './permissions/permissions.guard.js';
import { PermissionsModule } from './permissions/permissions.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PropertyModule } from './property/property.module.js';
import { RolesModule } from './roles/roles.module.js';
import { SitePagesModule } from './site-pages/site-pages.module.js';
import { SocietyContextGuard } from './society/society-context.guard.js';
import { SocietyModule } from './society/society.module.js';
import { StaffModule } from './staff/staff.module.js';
import { FacilitiesModule } from './facilities/facilities.module.js';
import { HelpdeskModule } from './helpdesk/helpdesk.module.js';
import { WorkOrdersModule } from './work-orders/work-orders.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          // Never log credentials or session cookies.
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          autoLogging: { ignore: (req) => req.url === '/health' },
        },
      }),
    }),
    // Global default; sensitive routes (login, forms) set tighter limits with @Throttle.
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }] }),
    PrismaModule,
    StorageModule,
    SocietyModule,
    NoticesModule,
    SitePagesModule,
    CommitteeModule,
    GalleryModule,
    AuditModule,
    AuthModule,
    PermissionsModule,
    RolesModule,
    UsersModule,
    PropertyModule,
    MembersModule,
    FormsModule,
    FinanceModule,
    BillingModule,
    PaymentsModule,
    DonationsModule,
    ExpensesModule,
    LedgerModule,
    ReportsModule,
    OverviewModule,
    DocumentsModule,
    StaffModule,
    FacilitiesModule,
    HelpdeskModule,
    WorkOrdersModule,
    VehiclesModule,
    AuditLogModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    // Responses declared with @ZodResponse are parsed by their schema, so unlisted fields never leak.
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    // Every successful write by a logged-in user leaves an audit_logs row.
    { provide: APP_INTERCEPTOR, useExisting: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: rate limit, attach the society, check the login (default deny), CSRF,
    // then the permission the route declares (default deny again: no @Can, no entry).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: SocietyContextGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: CsrfGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
  ],
})
export class AppModule {}
