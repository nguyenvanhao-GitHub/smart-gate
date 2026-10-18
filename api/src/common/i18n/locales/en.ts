import { MessageCatalog } from '../message-catalog';

/**
 * Bản dịch tiếng Anh. Kiểu `MessageCatalog` = `Record<MessageKey, string>` nên thiếu bất kỳ khóa
 * nào là **lỗi biên dịch** — đó là chốt chặn "quên dịch".
 *
 * Chỉ dịch lời văn hệ thống. Giá trị tham số (`{dossierCode}`, `{gateName}`…) là dữ liệu nghiệp
 * vụ/danh mục nên giữ nguyên, không dịch — xem ranh giới ghi ở `locales/vi.ts`.
 */
export const EN_MESSAGES: MessageCatalog = {
  // --- Common --------------------------------------------------------------
  'common.badRequest': 'Invalid request.',
  'common.unauthorized': 'You must sign in to perform this action.',
  'common.forbidden': 'You are not allowed to perform this action.',
  'common.notFound': 'The requested data was not found.',
  'common.conflict': 'The action conflicts with the current state of the data.',
  'common.serverError': 'The system encountered an error. Please try again later.',

  // --- Authentication / session -------------------------------------------
  'auth.missingToken': 'Missing Bearer token.',
  'auth.invalidToken': 'Invalid token.',
  'auth.expiredToken': 'The token has expired.',
  'auth.invalidCredentials': 'Incorrect username or password.',
  'auth.accountLocked': 'The account is locked.',
  'auth.accountPending': 'The account is awaiting approval.',
  'auth.accountNotFound': 'Account not found.',
  'auth.unknownActor': 'Unable to identify the user performing this action.',
  'auth.unknownAccess': 'Unable to determine the current user permissions.',
  'auth.endpointNotDeclared':
    'This endpoint does not declare a required permission, so it is denied by the deny-by-default rule.',
  'auth.permissionDenied': 'You are not allowed to perform this action (required: {permissions}).',
  'auth.currentPasswordWrong': 'The current password is incorrect.',
  'auth.newPasswordSame': 'The new password must differ from the current one.',

  // --- Users ---------------------------------------------------------------
  'user.notFound': 'User not found.',
  'user.duplicated': 'The account already exists.',
  'user.cannotDeleteSelf': 'You cannot delete the account you are signed in with.',
  'user.cannotLockSelf': 'You cannot lock the account you are signed in with.',
  'user.lockReasonRequired': 'A reason is required to lock an account.',
  'user.notPending': 'Only accounts awaiting approval can be approved.',
  'auth.registerDuplicateUsername': 'Username already exists.',
  'auth.registerDuplicateEmail': 'Email already exists.',
  'auth.registerDuplicatePhone': 'Phone number already exists.',
  'auth.registerDuplicateTaxCode': 'Tax code already exists.',
  'auth.registerDuplicateIdNumber': 'ID number already exists.',

  // --- Roles / permissions -------------------------------------------------
  'role.notFound': 'Role not found.',
  'role.notFoundForPermissions': 'The role to update permissions for was not found.',
  'role.codeInvalid': 'A role code may only contain uppercase letters, digits and underscores (2–64 characters).',
  'role.codeDuplicated': 'The role code already exists.',
  'role.systemImmutable': 'System roles cannot be deleted.',
  'role.systemCannotLock': 'System roles cannot be locked.',
  'role.inUse':
    'The role is assigned to {count} account(s) and cannot be deleted. Remove it from those accounts first.',
  'role.permissionUnknown': 'Invalid permission code: {codes}.',
  'role.unknownRoles': 'Role does not exist: {codes}.',
  'role.systemAdminCoreRequired':
    'You cannot remove the core administration permissions of the System Administrator role: {codes}. Doing so would leave no one able to administer the system.',

  // --- Catalogs ------------------------------------------------------------
  'catalog.typeNotFound': 'Catalog group not found.',
  'catalog.itemNotFound': 'Catalog item not found.',
  'catalog.itemCodeDuplicated': 'The catalog code already exists in this group.',
  'catalog.itemNameDuplicated': 'The catalog item name already exists in this group.',
  'catalog.itemSortOrderDuplicated': 'The sort order already exists in this group.',
  'catalog.itemSortOrderRequired': 'Please enter sort order.',
  'catalog.itemSortOrderInvalid': 'Sort order must be a non-zero integer.',
  'catalog.itemTypeMismatch': 'The catalog item does not belong to the specified group.',
  'catalog.typeCodeDuplicated': 'The catalog group code already exists.',
  'catalog.typeNameDuplicated': 'The catalog group name already exists.',
  'catalog.lockSystemForbidden': 'Cannot lock an item that belongs to a default catalog group.',
  'catalog.itemDeleteSystemForbidden':
    'Items in a default system catalog group can only be locked, not deleted.',
  'catalog.itemDeleteReferencedForbidden':
    'Only admin-added items with no referenced data can be deleted; a locked/in-use item can only be locked.',
  'catalog.typeDeleteSystemForbidden': 'A default system catalog group cannot be deleted.',
  'catalog.typeDeleteNotEmpty':
    'The catalog group still has {count} item(s) inside, so it cannot be deleted; delete all items first.',
  // --- Dossiers ------------------------------------------------------------
  'dossier.notFound': 'Dossier not found.',
  'dossier.forbidden': 'You are not allowed to access this dossier.',
  'dossier.idInvalid': 'The dossier identifier is not in a valid format.',
  'dossier.missingId': 'The dossier identifier is required to process this task.',
  'dossier.submitIncomplete': 'The dossier is not ready for submission. Please complete the missing information.',
  'dossier.missingDocument': 'Missing required document: {name}.',
  'dossier.appointmentInPast': 'The border-crossing appointment cannot be scheduled in the past.',
  'dossier.missingEnterpriseTaxCode': 'Tax code / ID card number is missing.',
  'dossier.invalidEnterpriseTaxCode': 'Tax code must consist of 10 digits or 10 digits with a 3-digit branch code.',
  'dossier.missingIdNumber': 'National ID / passport number is missing.',
  'dossier.invalidIdNumber': 'National ID / passport number format is invalid (6-32 characters).',
  'dossier.missingEnterpriseName': 'Enterprise name / declarant name is missing.',
  'dossier.missingRepresentative': 'Representative name is missing.',
  'dossier.missingPhone': 'Contact phone number is missing.',
  'dossier.invalidPhone': 'Invalid contact phone number.',
  'dossier.missingEmail': 'Contact email address is missing.',
  'dossier.invalidEmail': 'Invalid contact email address.',
  'dossier.missingAddress': 'Contact address is missing.',
  'dossier.missingVehicles': 'Dossier must have at least one transport vehicle.',
  'dossier.missingPlateNumber': '{tag}License plate number is missing.',
  'dossier.invalidPlateNumber': '{tag}Invalid license plate number format.',
  'dossier.missingVehicleType': '{tag}Vehicle type is missing.',
  'dossier.missingContainerNumber': '{tag}Container number is missing.',
  'dossier.missingTrailerNumber': '{tag}Trailer number is missing.',
  'dossier.missingTransportLicense': '{tag}Transport licence number is missing.',
  'dossier.missingPayloadWeight': '{tag}Payload weight is missing.',
  'dossier.invalidPayloadWeight': '{tag}Payload weight must be greater than 0.',
  'dossier.missingDriverName': '{tag}Driver full name is missing.',
  'dossier.missingDriverDocType': '{tag}Driver identity document type is missing.',
  'dossier.missingDriverDocNo': '{tag}Driver ID / Passport number is missing.',
  'dossier.missingDriverLicenseNo': '{tag}Driver licence number is missing.',
  'dossier.missingDriverPhone': '{tag}Driver phone number is missing.',
  'dossier.missingDriverNationality': '{tag}Driver nationality is missing.',
  'dossier.missingCargoItems': 'Dossier must have at least one cargo item.',
  'dossier.missingCargoType': '{tag}Commodity type is missing.',
  'dossier.missingCargoName': '{tag}Cargo description is missing.',
  'dossier.missingQuantity': '{tag}Quantity is missing.',
  'dossier.invalidQuantity': '{tag}Quantity must be greater than 0.',
  'dossier.missingUnit': '{tag}Unit of measure is missing.',
  'dossier.missingCargoWeight': '{tag}Gross weight is missing.',
  'dossier.invalidCargoWeight': '{tag}Gross weight must be greater than 0.',
  'dossier.missingScheduledAt': 'Please select scheduled arrival date.',
  'dossier.statusCancelled': 'The dossier has been cancelled and cannot be submitted.',
  'dossier.lockedForEdit':
    'A submitted dossier cannot be edited. Only draft dossiers or dossiers awaiting supplements can be edited.',
  'dossier.attachmentsLocked': 'A submitted dossier cannot have its attachments changed.',
  'dossier.noAttachmentSelected': 'No file has been selected to attach to the dossier.',
  'dossier.attachmentMissing': 'Attachment not found: {codes}.',
  'dossier.attachmentDeleted': 'A deleted file cannot be attached to the dossier.',
  'dossier.attachmentOwnedByOther': 'The attachment already belongs to another dossier and cannot be reattached.',
  'dossier.attachmentNotInDossier': 'The attachment was not found in this dossier.',
  'dossier.copyAttachmentUnavailable':
    'Attachments cannot be copied because file storage is not configured. Please contact the administrator.',
  'dossier.feeNotFound': 'Dossier / fee declaration not found.',
  'dossier.plateInUse':
    'Plate number {plateNumber} is already used in active dossier ({code}). A plate may have only one dossier in progress.',
  'dossier.driverIdInUse':
    'Driver ID number {idNumber} is already used in active dossier ({code}). A driver may have only one dossier in progress.',
  'dossier.tagVehicle': 'Vehicle {index}: ',
  'dossier.tagCargo': 'Cargo line {index}: ',
  'dossier.cannotCancelPastGate':
    'Dossiers can only be cancelled while in "Waiting for entry" status. Once approved past the gate, cancellation is not allowed.',

  // --- Enterprises / drivers / vehicles (reusable registry) ----------------
  'enterprise.notFound': 'Enterprise not found.',
  'enterprise.taxCodeDuplicated': 'Tax code "{taxCode}" already exists in the system.',
  'enterpriseDriver.notFound': 'Driver not found.',
  'enterpriseDriver.idNumberDuplicated': 'ID number "{idNumber}" already exists for this enterprise.',
  'enterpriseVehicle.notFound': 'Vehicle not found.',
  'enterpriseVehicle.plateDuplicated': 'Plate number "{plateNumber}" already exists for this enterprise.',

  // --- Attachments & storage ----------------------------------------------
  'file.notFound': 'Attachment not found.',
  'file.deleted': 'The attachment has been deleted.',
  'file.forbidden': 'You are not allowed to access this attachment.',
  'file.forbiddenDossier': 'You are not allowed to access attachments of this dossier.',
  'file.idInvalid': 'The attachment identifier is not in a valid format.',
  'file.notSelected': 'No file selected for upload (field "file").',
  'file.emptyContent': 'The file content could not be read or the file is empty.',
  'file.tooLarge': 'The file exceeds the allowed size (max {max} MB).',
  'file.typeNotAllowed': 'File format not allowed. Accepted formats: {allowed}.',
  'file.extensionMismatch': 'The extension "{extension}" does not match the real file content ({detected}).',
  'file.documentTypeInvalid': 'The document type code does not exist or has been locked in the catalog.',
  'storage.notConfigured': 'File storage is not configured. Please contact the system administrator.',
  'storage.notConfiguredUpload':
    'File storage is not configured, so the file cannot be uploaded. Please contact the system administrator.',
  'storage.notConfiguredDownload':
    'File storage is not configured, so the file cannot be downloaded. Please contact the system administrator.',
  'storage.emptyObject': 'The storage returned empty content for this attachment.',
  'storage.unavailable':
    'The attachment storage is unavailable. Please try again later or contact the system administrator.',

  // --- Inter-agency workflow ----------------------------------------------
  'workflow.dossierNotSubmitted':
    'The dossier is still a draft and has not been submitted, so the inter-agency workflow has not started.',
  'workflow.dossierCancelled': 'The dossier has been cancelled, so the inter-agency workflow cannot be opened.',
  'workflow.routeNotConfigured':
    'No workflow steps are configured for dossier type {type} in the "workflow_step_roles" table.',
  'workflow.unknownStep': 'Step "{step}" does not belong to the workflow of dossier type {dossierType}.',
  'workflow.flowRejected': 'The dossier has been rejected, so no further workflow action is possible.',
  'workflow.flowCompleted': 'The inter-agency workflow is complete, so no further action is possible.',
  'workflow.alreadyDecided': 'Step "{step}" already has a decision and cannot be decided again.',
  'workflow.outOfOrder': 'Wrong processing order: the dossier is waiting for {expected}, step "{step}" is not due yet.',
  'workflow.nextStepFallback': 'the next step of the workflow',
  'workflow.otherAgency': 'another agency',
  'workflow.roleNotAllowed': 'Your current role cannot process step "{step}" (owned by {agency}).',
  'workflow.gateStepNotDecidable':
    'Step "{step}" is a gate step; it is completed only when the vehicle passes the gate (a gate event) on the Gate in/out screen, not decided on the inter-agency screen.',
  'workflow.quarantinePriorityRequired':
    'This dossier has a quarantine-priority flag: the Quarantine step must be completed before Border Guard and Customs can process step "{step}".',
  'workflow.waitingSupplement': 'Step "{step}" is currently waiting for supplement from the enterprise, action is not allowed at this time.',
  'workflow.waitingCall': 'Dossier is in Waiting for Call status. Coordinator must call vehicle for inspection before approving.',
  'workflow.reasonCodeRequired': 'The action "{decision}" requires a reason code.',
  'workflow.reasonNoteRequired': 'The action "{decision}" requires a written reason.',
  'workflow.reasonCodeInvalid': 'The reason code "{reasonCode}" is not in the active catalog.',
  'workflow.forbiddenSupplement':
    'You are not allowed to request supplements for this dossier (required: workflow.update or workflow.approve).',
  'workflow.forbiddenDecide': 'You are not allowed to decide this workflow step (required: workflow.approve).',
  'workflow.supplementViaWorkflowScreen':
    'Supplement requests must be made on the inter-agency processing screen so that a mandatory reason code can be selected.',
  'workflow.roleNotAllowedScreen': 'Your current role is not allowed to perform tasks on this screen.',
  'workflow.feeRoleNotAllowed': 'Your current role is not allowed to perform this fee task.',
  'workflow.agency.ENTERPRISE': 'Enterprise',
  'workflow.agency.BORDER_GUARD': 'Border Guard',
  'workflow.agency.CUSTOMS': 'Customs',
  'workflow.agency.QUARANTINE': 'Quarantine',
  'workflow.agency.FEE_COLLECTOR': 'Fee Collection',
  'workflow.agency.DEFAULT': 'specialized authority',
  'workflow.decision.APPROVE': 'Approve',
  'workflow.decision.REQUEST_SUPPLEMENT': 'Request supplement',
  'workflow.decision.REJECT': 'Reject',

  // --- Gate ----------------------------------------------------------------
  'gate.catalogMissing': 'The border gate catalog is not configured. Please contact the system administrator.',
  'gate.notFound': 'Gate "{gateCode}" does not exist in the border catalog.',
  'gate.inactive': 'Gate "{gateName}" is temporarily out of service.',
  'gate.noActiveGate': 'No active gate exists in the border catalog.',
  'gate.dossierNotFound': 'The dossier for this gate event was not found.',
  'gate.dossierNotFoundByCode': 'No dossier found with code "{code}".',
  'gate.blocked': 'Dossier {dossierCode} is not eligible to pass gate {gateName}.',
  'gate.alreadyLeft': 'Dossier {dossierCode} has already left the border, no further passage can be recorded at gate {gateName}.',
  'gate.duplicateEntry': 'Dossier {dossierCode} has already been let in at gate {gateName}.',
  'gate.duplicateExit': 'Dossier {dossierCode} has already been let out at gate {gateName}.',
  'gate.exitBeforeEntry': 'No entry has been recorded yet, so dossier {dossierCode} cannot be let out at gate {gateName}.',
  'gate.entryAfterExit': 'Dossier {dossierCode} has already left the border and cannot re-enter at gate {gateName}.',
  'gate.duplicatePassage': 'Dossier {dossierCode} was just recorded passing gate {gateName} in another request. Please look it up again.',
  'gate.notEligibleForEntry': 'Dossier {code} is not pending entry gate (only submitted dossiers that have not entered can be searched).',
  'gate.notEligibleForExit': 'Dossier {code} has not been approved for entry or has already exited.',

  // --- Dispatch / yard -----------------------------------------------------
  'dispatch.idInvalid': 'The dispatch assignment identifier is not in a valid format.',
  'dispatch.dossierNotFound': 'The dossier to dispatch was not found.',
  'dispatch.assignmentNotFound': 'The dispatch position to move was not found.',
  'dispatch.assignmentReleased': 'This position has already been released and cannot be moved.',
  'dispatch.assignmentDossierNotFound': 'The dossier of this dispatch position was not found.',
  'dispatch.releaseNotFound': 'The dispatch position to release was not found.',
  'dispatch.vehicleAlreadyPlaced':
    'The vehicle of dossier {dossierCode} is already at another position. Move it or release the current position first.',
  'dispatch.slotOccupied': 'Parking slot {slotCode} is occupied by another vehicle. Please pick a free slot.',
  'dispatch.slotJustTaken':
    'Parking slot {slotCode} has just been taken by another vehicle. Please pick a free slot.',
  'dispatch.vehicleJustMoved':
    'The vehicle of dossier {dossierCode} has just been assigned to another position. Please reload the dispatch board.',
  'dispatch.placementRequired': 'Pick at least one position: gate, lane or parking slot in a yard.',
  'dispatch.slotNeedsYard': 'Picking a parking slot requires picking the matching yard.',
  'dispatch.yardNeedsSlot': 'Picking a yard requires picking a specific parking slot.',
  'dispatch.laneNeedsGate': 'Picking a lane requires picking the matching gate.',
  'dispatch.laneNotFound': 'Lane "{laneCode}" does not exist in the border catalog.',
  'dispatch.laneInactive': 'Lane "{laneName}" is temporarily out of service.',
  'dispatch.laneNotInGate': 'Lane "{laneName}" does not belong to gate "{gateCode}".',
  'dispatch.gateDirectionMismatch':
    'Gate "{gateName}" ({gateCode}) does not match the dossier flow direction: import dossiers use entry gates, export dossiers use exit gates.',
  'dispatch.inspectionInvalidTransition':
    'Cannot change inspection status from "{from}" to "{to}" — invalid inspection/consolidation order.',
  'dispatch.inspectionNotActive':
    'The dispatch assignment has been released, so its inspection status cannot be updated.',
  'dispatch.placementGate': 'gate {code}',
  'dispatch.placementLane': 'lane {code}',
  'dispatch.placementSlot': 'parking slot {code}',
  'dispatch.placementDefault': 'new position',
  'yard.idInvalid': 'The yard identifier is not in a valid format.',
  'yard.notFound': 'Yard not found.',
  'yard.notFoundSelected': 'The selected yard was not found.',
  'yard.inactive': 'Yard "{yardName}" is temporarily out of service.',
  'yard.slotNotFound': 'Yard "{yardName}" has no parking slot "{slotCode}".',
  'yard.slotLockedOccupied': 'Parking slot "{slotCode}" is occupied and cannot be locked. Please release it first.',
  'yardZone.notFound': 'Yard zone to update was not found.',
  'yardZone.invalidCapacity': 'Yard capacity must be a non-negative integer.',
  'yardZone.cannotReduceOccupied': 'Cannot reduce capacity because there are vehicles occupying the affected slots.',
  'yardZone.cannotReduceSlotOccupied':
    'Cannot reduce capacity to {capacity} because affected slots ({slots}) are currently occupied: {details}. Please release or transfer the vehicles first.',
  'yardZone.cannotReduceCapacityBelowOccupied':
    'Cannot reduce capacity to {capacity} slots because the yard currently has {occupied} vehicles parked (exceeding new capacity). Please release or transfer vehicles first.',

  // --- Queue ---------------------------------------------------------------
  'queue.dossierNotFound': 'The dossier to issue a queue ticket for was not found.',
  'queue.dossierNotSubmitted':
    'The dossier has not been submitted or has already been closed, so no queue ticket can be issued.',
  'queue.conflict': 'Queue tickets are being issued for several dossiers at once. Please press issue again.',

  // --- Operations screens ---------------------------------------------------
  'operation.screenNotFound': 'There is no operations screen with code "{slug}".',
  'operation.actionNotFound': 'Action "{action}" does not belong to operations screen "{slug}".',
  'operation.stepNotFound': 'Operations step "{step}" is not in the catalogue.',
  'operation.screenHasNoConfirm': 'Operations screen "{slug}" does not record any agency confirmation.',

  // --- Fees -----------------------------------------------------------------
  'fee.screenNotFound': 'There is no fee screen with code "{slug}".',
  'fee.actionNotFound': 'Fee action "{action}" does not belong to screen "{slug}".',
  'fee.methodNotFound': 'Payment method "{method}" is not valid.',
  'fee.dossierNotFound': 'The dossier to calculate fees for was not found.',
  'fee.chargeNotFound': 'The dossier has no fee item "{ruleCode}" to adjust. Calculate the fees first.',
  'fee.reasonCodeRequired': 'A reason code is mandatory when adjusting a fee item.',
  'fee.reasonCodeInvalid': 'Reason code "{reasonCode}" is not in the fee adjustment catalogue or has been locked.',
  'fee.amountInvalid': 'The adjusted amount must be a non-negative whole number of dong.',
  'fee.transactionNotFound': 'Fee transaction not found.',
  'fee.transactionAmountInvalid': 'The transaction amount must be greater than 0.',
  'fee.transactionExceedsOutstanding':
    'The amount {amount} exceeds the outstanding balance ({outstanding}) of the dossier.',
  'fee.transactionDuplicateReference': 'Transaction reference "{referenceCode}" is already recorded for this dossier.',
  'fee.stepNotReached': 'The dossier has not reached the fee-collection step in the workflow, so fees cannot be collected yet.',
  'fee.notSettled':
    'The fee step cannot be approved: the dossier still has {outstanding} {currency} of fees not confirmed as paid.',
  'fee.ruleNotFound': 'The fee schedule version to edit was not found.',
  'fee.ruleDuplicateVersion': 'Code "{code}" already has a version effective from {effectiveFrom}. Choose another effective date.',
  'fee.ruleEffectiveFromTooEarly':
    'Effective date {effectiveFrom} must be after the start date of the running version ({current}).',
  'fee.ruleAmountLocked':
    'The amount of an applied or active version cannot be changed. Create a new version with a later effective date to keep history.',

  // --- Reports -------------------------------------------------------------
  'report.notFound': 'No report found with code "{code}".',

  // --- Notifications -------------------------------------------------------
  'notification.notFound': 'Notification not found.',
  'notification.forbidden': 'You cannot mark notifications of another user as read.',
  'notification.dossierCancelledTitle': 'Dossier {code} cancelled',
  'notification.dossierCancelledContent': '{note}',
  'notification.dossierCancelledDefaultNote': 'Dossier has been cancelled in the system.',
  'notification.dossierSubmittedTitle': 'Dossier {code} submitted',
  'notification.dossierSubmittedContent': 'Dossier {code} has been submitted and is awaiting specialized authority processing.',
  'notification.dossierNewPendingTitle': 'New dossier {code} awaiting processing',
  'notification.dossierNewPendingContent': 'Dossier {code} is awaiting gate entry confirmation.',
  'notification.dossierTurnProcessingTitle': 'Dossier {code} turn for processing',
  'notification.dossierTurnProcessingFeeContent': 'Dossier {code} has completed inter-agency processing and is awaiting fee collection.',
  'notification.dossierTurnProcessingStepContent': 'Dossier {code} has been moved to step "{stepName}". Please check and process.',
  'notification.dossierAssignedTitle': 'Dossier {code} location assigned',
  'notification.dossierAssignedContent': 'Vehicle for dossier {code} assigned to {placement}.',
  'notification.dossierMovedTitle': 'Dossier {code} location moved',
  'notification.dossierMovedContent': 'Vehicle for dossier {code} moved to {placement}.',
  'notification.vehicleInspectionTitle': 'Vehicle ({plateNumber}) entering inspection',
  'notification.vehicleInspectionContentWithTicket': 'Vehicle {plateNumber} (Ticket #{ticketCode}) has been called to inspection area.',
  'notification.vehicleInspectionContentNoTicket': 'Vehicle {plateNumber} has been called to inspection area.',
  'notification.feeSettledTitle': 'Dossier {code} financial obligations completed',
  'notification.feeSettledContent': 'Dossier {code} collected full amount of {total} {currency}.',
  'notification.feePartialTitle': 'Payment recorded for dossier {code}',
  'notification.feePartialContent': 'Dossier {code} outstanding balance is {outstanding} {currency}.',
  'notification.feeWaitingExitTitle': 'Dossier {code} awaiting gate exit confirmation',
  'notification.feeWaitingExitContent': 'Dossier {code} fee collection completed and awaiting exit gate confirmation.',
  'notification.gateAllowedTitle': 'Vehicle {plateNumber} passed through gate',
  'notification.gateAllowedContent': 'Vehicle for dossier {code} was allowed through gate by {actorText}.',
  'notification.gateDeniedTitle': 'Dossier {code} denied at gate {gateName}',
  'notification.gateDeniedContent': 'Vehicle for dossier {code} was denied through gate {gateName}.',
  'notification.gateDeniedContentWithBlocking': 'Vehicle for dossier {code} was denied through gate {gateName}. Missing requirements: {reasons}',
  'notification.vehicleWaitingDispatchTitle': 'Vehicle {plateNumber} awaiting dispatch',
  'notification.vehicleWaitingDispatchContent': 'Vehicle {plateNumber} is awaiting dispatch.',
  'notification.userRegisteredTitle': 'New user account pending approval',
  'notification.userRegisteredContent': 'Account {username} was registered and is pending approval. Please review and approve.',
  'notification.workflowSupplementTitle': 'Dossier {code} supplement requested by {agency}',
  'notification.workflowSupplementContent': 'Dossier {code} requires supplement by {agency}.',
  'notification.workflowSupplementContentWithNote': 'Dossier {code} requires supplement by {agency}. Note: {note}',
  'notification.workflowRejectedTitle': 'Dossier {code} rejected by {agency}',
  'notification.workflowRejectedContent': 'Dossier {code} rejected by {agency}.',
  'notification.workflowRejectedContentWithNote': 'Dossier {code} rejected by {agency}. Note: {note}',
  'notification.workflowApprovedTitle': 'Dossier {code} approved by {agency}',
  'notification.workflowApprovedContent': 'Dossier {code} approved successfully by {agency}.',
  'notification.workflowApprovedContentWithNote': 'Dossier {code} approved successfully by {agency}. Note: {note}',

  // --- System settings -----------------------------------------------------
  'systemSetting.emptyUpdate': 'There are no settings to update.',
  'systemSetting.keyUnknown': 'Setting "{key}" is not in the catalogue.',
  'systemSetting.valueInvalid': 'The value of "{key}" must be an integer between {min} and {max}.',
};
