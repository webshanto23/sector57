import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  payrollCreateSchema,
  payrollMonthQuery,
  payrollMonthSchema,
  payrollPaySchema,
  payrollRunSchema,
  payrollVoidSchema,
  payslipEditSchema,
  payslipSheetSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { PayrollDraftService } from './payroll-draft.service.js';
import { PayrollPayService } from './payroll-pay.service.js';
import { PayrollService } from './payroll.service.js';

export class PayrollMonthQueryDto extends createDto(payrollMonthQuery) {}
export class PayrollMonthDto extends createDto(payrollMonthSchema) {}
export class PayrollRunDto extends createDto(payrollRunSchema) {}
export class PayrollCreateDto extends createDto(payrollCreateSchema) {}
export class PayslipEditDto extends createDto(payslipEditSchema) {}
export class PayrollPayDto extends createDto(payrollPaySchema) {}
export class PayrollVoidDto extends createDto(payrollVoidSchema) {}
export class PayslipSheetDto extends createDto(payslipSheetSchema) {}
export class PayslipParamDto extends createDto(z.object({ id: z.uuid(), payslipId: z.uuid() })) {}

/** Payroll (বেতন), society-wide under the `payroll` permission. The services write their own audit rows. */
@Controller('payroll')
@SkipAudit()
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly drafts: PayrollDraftService,
    private readonly payments: PayrollPayService,
  ) {}

  @Get()
  @Can('payroll', 'view')
  @ZodResponse({ status: 200, type: PayrollMonthDto })
  month(@CurrentActor() actor: Actor, @Query() { month }: PayrollMonthQueryDto) {
    return this.payroll.month(actor, month);
  }

  @Get(':id')
  @Can('payroll', 'view')
  @ZodResponse({ status: 200, type: PayrollRunDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.payroll.get(actor, id);
  }

  /** A draft for the month. 409 `payroll_exists`, `payroll_no_staff`; 400 `future_month`. */
  @Post()
  @Can('payroll', 'create')
  @ZodResponse({ status: 201, type: PayrollRunDto })
  prepare(@CurrentActor() actor: Actor, @Body() { month }: PayrollCreateDto) {
    return this.drafts.prepare(actor, month);
  }

  /** Recalculates a draft from current pay and attendance, keeping edited lines. */
  @Post(':id/refresh')
  @HttpCode(200)
  @Can('payroll', 'edit')
  @ZodResponse({ status: 200, type: PayrollRunDto })
  refresh(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.drafts.refresh(actor, id);
  }

  /** A draft payslip's allowances, deductions, fund and note. 400 `negative_net`. */
  @Patch(':id/payslips/:payslipId')
  @Can('payroll', 'edit')
  @ZodResponse({ status: 200, type: PayrollRunDto })
  editPayslip(@CurrentActor() actor: Actor, @Param() { id, payslipId }: PayslipParamDto, @Body() body: PayslipEditDto) {
    return this.drafts.editPayslip(actor, id, payslipId, body);
  }

  /** 403 `cannot_approve_own` for the one who prepared it. */
  @Post(':id/approve')
  @HttpCode(200)
  @Can('payroll', 'approve')
  @ZodResponse({ status: 200, type: PayrollRunDto })
  approve(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.drafts.approve(actor, id);
  }

  /** Books one paid expense per fund. 403 `pay_needs_expenses`; 409 `fund_insufficient`. */
  @Post(':id/pay')
  @HttpCode(200)
  @Can('payroll', 'edit')
  @ZodResponse({ status: 200, type: PayrollRunDto })
  pay(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: PayrollPayDto) {
    return this.payments.pay(actor, id, body);
  }

  /** A paid run's expenses are voided with it (403 `void_needs_expenses` without `expenses.approve`). */
  @Post(':id/void')
  @HttpCode(200)
  @Can('payroll', 'approve')
  @ZodResponse({ status: 200, type: PayrollRunDto })
  void(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() { reason }: PayrollVoidDto) {
    return this.payments.void(actor, id, reason);
  }

  @Get(':id/payslips/:payslipId/sheet')
  @Can('payroll', 'view')
  @ZodResponse({ status: 200, type: PayslipSheetDto })
  sheet(@CurrentActor() actor: Actor, @Param() { id, payslipId }: PayslipParamDto) {
    return this.payroll.sheet(actor, id, payslipId);
  }
}
