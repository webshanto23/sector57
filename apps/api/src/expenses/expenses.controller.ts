import { Body, Controller, ForbiddenException, Get, Header, HttpCode, Param, Patch, Post, Put, Query, StreamableFile, UploadedFile } from '@nestjs/common';
import {
  budgetInputSchema,
  budgetQuery,
  budgetSchema,
  expenseDetailSchema,
  expenseHeadInputSchema,
  expenseHeadSchema,
  expenseInputSchema,
  expenseListQuery,
  expenseListSchema,
  expenseOptionsSchema,
  expensePaySchema,
  expenseReasonSchema,
  vendorInputSchema,
  vendorSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Authenticated, Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { requireUpload, VoucherUpload, type UploadedImage } from '../storage/image-upload.js';
import { BudgetsService } from './budgets.service.js';
import { ExpenseSetupService } from './expense-setup.service.js';
import { ExpenseListService } from './expense-list.service.js';
import { ExpenseVouchersService } from './expense-vouchers.service.js';
import { ExpensesService } from './expenses.service.js';

export class ExpenseDetailDto extends createDto(expenseDetailSchema) {}
export class ExpenseInputDto extends createDto(expenseInputSchema) {}
export class ExpenseListDto extends createDto(expenseListSchema) {}
export class ExpenseListQueryDto extends createDto(expenseListQuery) {}
export class ExpenseOptionsDto extends createDto(expenseOptionsSchema) {}
export class ExpensePayDto extends createDto(expensePaySchema) {}
export class ExpenseReasonDto extends createDto(expenseReasonSchema) {}
export class ExpenseHeadDto extends createDto(expenseHeadSchema) {}
export class ExpenseHeadInputDto extends createDto(expenseHeadInputSchema) {}
export class VendorDto extends createDto(vendorSchema) {}
export class VendorInputDto extends createDto(vendorInputSchema) {}
export class BudgetDto extends createDto(budgetSchema) {}
export class BudgetInputDto extends createDto(budgetInputSchema) {}
export class BudgetQueryDto extends createDto(budgetQuery) {}
export class VoucherParamDto extends createDto(z.object({ id: z.uuid(), documentId: z.uuid() })) {}

/**
 * Expenses. Every route needs `expenses.view`; the service checks the step's own rule
 * (requester, approver, payer) and writes its own audit rows. No deletes: a wrong expense is
 * rejected or voided.
 */
@Controller('expenses')
@SkipAudit()
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly listing: ExpenseListService,
    private readonly vouchers: ExpenseVouchersService,
    private readonly setup: ExpenseSetupService,
  ) {}

  /** Heads, vendors and funds for the form and the filters (`expenses.view` or `create`). */
  @Get('options')
  @Authenticated()
  @ZodResponse({ status: 200, type: ExpenseOptionsDto })
  options(@CurrentActor() actor: Actor) {
    if (!actor.access.can('view', 'expenses') && !actor.access.can('create', 'expenses')) {
      throw new ForbiddenException({ code: 'forbidden', message: 'You do not have permission for this' });
    }
    return this.setup.options(actor.societyId);
  }

  @Get()
  @Can('expenses', 'view')
  @ZodResponse({ status: 200, type: ExpenseListDto })
  list(@CurrentActor() actor: Actor, @Query() query: ExpenseListQueryDto) {
    return this.listing.list(actor, query);
  }

  @Get(':id')
  @Can('expenses', 'view')
  @ZodResponse({ status: 200, type: ExpenseDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.expenses.get(actor, id);
  }

  /** A new request. 400 `invalid_head`, `head_archived`, `invalid_vendor`, `invalid_fund`, `future_date`; 409 `fund_closed`. */
  @Post()
  @Can('expenses', 'create')
  @ZodResponse({ status: 201, type: ExpenseDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: ExpenseInputDto) {
    return this.expenses.create(actor, body);
  }

  /** Only while pending, by the requester or an `expenses.edit` holder. 409 `expense_not_pending`. */
  @Patch(':id')
  @Can('expenses', 'view')
  @ZodResponse({ status: 200, type: ExpenseDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: ExpenseInputDto) {
    return this.expenses.update(actor, id, body);
  }

  /** `expenses.approve`, never your own (403 `cannot_approve_own`). */
  @Post(':id/approve')
  @HttpCode(200)
  @Can('expenses', 'view')
  @ZodResponse({ status: 200, type: ExpenseDetailDto })
  approve(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.expenses.approve(actor, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Can('expenses', 'view')
  @ZodResponse({ status: 200, type: ExpenseDetailDto })
  reject(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: ExpenseReasonDto) {
    return this.expenses.reject(actor, id, body);
  }

  /** `expenses.edit`, approved only. 409 `fund_insufficient` when the account holds less, `fund_closed`. */
  @Post(':id/pay')
  @HttpCode(200)
  @Can('expenses', 'view')
  @ZodResponse({ status: 200, type: ExpenseDetailDto })
  pay(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: ExpensePayDto) {
    return this.expenses.pay(actor, id, body);
  }

  /** `expenses.approve`; approved or paid only (409 `expense_not_voidable`). */
  @Post(':id/void')
  @HttpCode(200)
  @Can('expenses', 'view')
  @ZodResponse({ status: 200, type: ExpenseDetailDto })
  void(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: ExpenseReasonDto) {
    return this.expenses.void(actor, id, body);
  }

  /** A photo or PDF of the bill or cash memo. 415 `unsupported_document`, 409 `too_many_vouchers`. */
  @Post(':id/vouchers')
  @Can('expenses', 'view')
  @VoucherUpload()
  @ZodResponse({ status: 201, type: ExpenseDetailDto })
  addVoucher(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @UploadedFile() file: UploadedImage | undefined) {
    return this.vouchers.addVoucher(actor, id, requireUpload(file));
  }

  /** Only before the expense is paid (409 `expense_voucher_locked`). */
  @Post(':id/vouchers/:documentId/remove')
  @HttpCode(200)
  @Can('expenses', 'view')
  @ZodResponse({ status: 200, type: ExpenseDetailDto })
  removeVoucher(@CurrentActor() actor: Actor, @Param() { id, documentId }: VoucherParamDto) {
    return this.vouchers.removeVoucher(actor, id, documentId);
  }

  /** A voucher file. Photos open in the browser; PDFs always download. */
  @Get(':id/vouchers/:documentId')
  @Can('expenses', 'view')
  @Header('Cache-Control', 'private, no-store')
  async voucher(@CurrentActor() actor: Actor, @Param() { id, documentId }: VoucherParamDto): Promise<StreamableFile> {
    const file = await this.vouchers.voucher(actor, id, documentId);
    const inline = file.contentType.startsWith('image/');
    return new StreamableFile(file.data, {
      type: file.contentType,
      disposition: `${inline ? 'inline' : 'attachment'}; filename="${file.fileName}"`,
      length: file.data.length,
    });
  }
}

/** Expense heads (`expenses.edit`). Archived, never deleted. */
@Controller('expense-heads')
@SkipAudit()
export class ExpenseHeadsController {
  constructor(private readonly setup: ExpenseSetupService) {}

  /** 409 `expense_head_name_taken`. */
  @Post()
  @Can('expenses', 'edit')
  @ZodResponse({ status: 201, type: ExpenseHeadDto })
  create(@CurrentActor() actor: Actor, @Body() body: ExpenseHeadInputDto) {
    return this.setup.createHead(actor, body);
  }

  @Put(':id')
  @Can('expenses', 'edit')
  @ZodResponse({ status: 200, type: ExpenseHeadDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: ExpenseHeadInputDto) {
    return this.setup.updateHead(actor, id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @Can('expenses', 'edit')
  @ZodResponse({ status: 200, type: ExpenseHeadDto })
  archive(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.setup.archiveHead(actor, id, true);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @Can('expenses', 'edit')
  @ZodResponse({ status: 200, type: ExpenseHeadDto })
  restore(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.setup.archiveHead(actor, id, false);
  }
}

/** Vendors (`expenses.edit`). Names as typed; archived, never deleted. */
@Controller('vendors')
@SkipAudit()
export class VendorsController {
  constructor(private readonly setup: ExpenseSetupService) {}

  @Post()
  @Can('expenses', 'edit')
  @ZodResponse({ status: 201, type: VendorDto })
  create(@CurrentActor() actor: Actor, @Body() body: VendorInputDto) {
    return this.setup.createVendor(actor, body);
  }

  @Put(':id')
  @Can('expenses', 'edit')
  @ZodResponse({ status: 200, type: VendorDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: VendorInputDto) {
    return this.setup.updateVendor(actor, id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @Can('expenses', 'edit')
  @ZodResponse({ status: 200, type: VendorDto })
  archive(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.setup.archiveVendor(actor, id, true);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @Can('expenses', 'edit')
  @ZodResponse({ status: 200, type: VendorDto })
  restore(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.setup.archiveVendor(actor, id, false);
  }
}

/** Budgets per expense head and fiscal year. */
@Controller('budgets')
@SkipAudit()
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  /** 400 `invalid_year` for a label that isn't one of the society's fiscal years. */
  @Get()
  @Can('budgets', 'view')
  @ZodResponse({ status: 200, type: BudgetDto })
  get(@CurrentActor() actor: Actor, @Query() query: BudgetQueryDto) {
    return this.budgets.get(actor, query);
  }

  @Put()
  @Can('budgets', 'edit')
  @ZodResponse({ status: 200, type: BudgetDto })
  set(@CurrentActor() actor: Actor, @Body() body: BudgetInputDto) {
    return this.budgets.set(actor, body);
  }
}
