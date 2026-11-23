/* HierarchyTreeControllerTest.cls   *****************************************************************************************
* Description:	Tests for HierarchyTreeController against Account, the self-referencing object every org has (ParentId).
*				At work, point insertAccountTree at the real hierarchy object and its required fields; nothing else here
*				names Account's fields outside the constants below.
******************************************************************************************************************************/
@IsTest
private class HierarchyTreeControllerTest {
	private static final String OBJECT_NAME = 'Account';
	private static final String PARENT_FIELD = 'ParentId';
	private static final String LABEL_FIELD = 'Name';
	private static final String TYPE_FIELD = 'Type';
	private static final String TOP_NAME = 'Hierarchy Top';
	private static final String RECORDS = HierarchyTreeController.DATA_SOURCE_RECORDS;

	// One parent, two children, one grandchild under the first child.
	private static List<Account> insertAccountTree() {
		Account topRec = new Account(Name = TOP_NAME, Type = 'Prospect', AccountNumber = 'TOP-1');
		insert topRec;
		Account firstChildRec = new Account(Name = 'Hierarchy Child A', ParentId = topRec.Id);
		Account secondChildRec = new Account(Name = 'Hierarchy Child B', ParentId = topRec.Id);
		insert new List<Account>{ firstChildRec, secondChildRec };
		Account grandchildRec = new Account(Name = 'Hierarchy Grandchild', ParentId = firstChildRec.Id);
		insert grandchildRec;
		return new List<Account>{ topRec, firstChildRec, secondChildRec, grandchildRec };
	}

	private static Map<String, HierarchyTreeController.HierarchyNode> getNodeMap(
			HierarchyTreeController.HierarchyResult result) {
		Map<String, HierarchyTreeController.HierarchyNode> nodeMap = new Map<String, HierarchyTreeController.HierarchyNode>();
		for (HierarchyTreeController.HierarchyNode node : result.nodes) {
			nodeMap.put(node.recordId, node);
		}
		return nodeMap;
	}

	private static HierarchyTreeController.HierarchyResult getColumnHierarchy(String columnFields, String avatarField) {
		return HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, TYPE_FIELD, null, columnFields, avatarField);
	}

	private static String getErrorMessage(String objectName, String parentField, String labelField, String typeField,
			String activeField) {
		try {
			HierarchyTreeController.getHierarchy(
				RECORDS, objectName, parentField, labelField, typeField, activeField, null, null);
		} catch (AuraHandledException ex) {
			return ex.getMessage();
		}
		Assert.fail('The configuration should have been refused, but the query ran.');
		return null;
	}

	private static String getColumnErrorMessage(String columnFields) {
		try {
			getColumnHierarchy(columnFields, null);
		} catch (AuraHandledException ex) {
			return ex.getMessage();
		}
		Assert.fail('The column fields should have been refused, but the query ran.');
		return null;
	}

	// Sample
	@IsTest
	static void testSampleHierarchy() {
		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			HierarchyTreeController.DATA_SOURCE_SAMPLE, null, null, null, null, null, null, null);

		Map<String, HierarchyTreeController.HierarchyNode> nodeMap = getNodeMap(result);
		Integer rootCount = 0;
		Integer inactiveCount = 0;
		for (HierarchyTreeController.HierarchyNode node : result.nodes) {
			if (node.parentId == null) { rootCount++; }
			if (node.isActive == false) { inactiveCount++; }
			Assert.isTrue(node.parentId == null || nodeMap.containsKey(node.parentId),
				'Every sample node should point at a parent that is also in the sample, but ' + node.label + ' does not.');
		}
		Assert.isTrue(result.nodes.size() > 30, 'The sample should hold more than 30 nodes, but held ' + result.nodes.size() + '.');
		Assert.areEqual(1, rootCount, 'The sample should have exactly one top node.');
		Assert.areEqual(1, inactiveCount, 'The sample should have exactly one inactive node, to show the muted style.');
		Assert.isFalse(result.isTruncated, 'The sample should never be marked as truncated.');
	}

	@IsTest
	static void testSampleHasCodesAndColumns() {
		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			HierarchyTreeController.DATA_SOURCE_SAMPLE, null, null, null, null, null, null, null);

		Assert.areEqual(2, result.columns.size(), 'The sample should offer two columns, a code and an owner.');
		Assert.areEqual('Name', result.labelFieldLabel, 'The sample should label its name column.');
		for (HierarchyTreeController.HierarchyNode node : result.nodes) {
			Assert.isTrue(String.isNotBlank(node.avatarText),
				'Every sample node should carry a code, but ' + node.label + ' does not.');
			Assert.areEqual(2, node.columnValues.size(), 'Every sample node should carry one value per column.');
		}
		Assert.areEqual('GLB-WW', result.nodes[0].avatarText, 'The sample codes should follow the type-code pattern.');
	}

	@IsTest
	static void testUnknownDataSourceFallsBackToSample() {
		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			'Anything', OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, null, null, null, null);

		Assert.isTrue(result.nodes[0].recordId.startsWith('sample-'), 'An unknown data source should return the sample tree.');
	}

	// Records
	@IsTest
	static void testRecordHierarchyMapsParents() {
		List<Account> accounts = insertAccountTree();

		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, null, null, null, null);

		Map<String, HierarchyTreeController.HierarchyNode> nodeMap = getNodeMap(result);
		Assert.areEqual(4, result.nodes.size(), 'Every account the test inserted should come back as a node.');
		Assert.isNull(nodeMap.get(accounts[0].Id).parentId, 'The top account should have no parent.');
		Assert.areEqual(String.valueOf(accounts[1].Id), nodeMap.get(accounts[3].Id).parentId,
			'The grandchild should point at the first child.');
		Assert.areEqual(TOP_NAME, nodeMap.get(accounts[0].Id).label, 'The name field should become the node label.');
		Assert.areEqual(Account.SObjectType.getDescribe().getLabelPlural(), result.objectPluralLabel,
			'The result should carry the object plural label for the breadcrumb.');
		Assert.isTrue(nodeMap.get(accounts[0].Id).isActive, 'Without an active field every node should be active.');
	}

	@IsTest
	static void testPicklistTypeFieldUsesLabel() {
		List<Account> accounts = insertAccountTree();
		String expectedLabel = null;
		for (Schema.PicklistEntry entry : Account.Type.getDescribe().getPicklistValues()) {
			if (entry.getValue() == 'Prospect') { expectedLabel = entry.getLabel(); }
		}

		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, TYPE_FIELD, null, null, null);

		Assert.areEqual(expectedLabel, getNodeMap(result).get(accounts[0].Id).typeLabel,
			'A picklist type field should come back as its label.');
	}

	@IsTest
	static void testTextTypeFieldUsesValue() {
		List<Account> accounts = insertAccountTree();

		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, 'AccountNumber', null, null, null);

		Assert.areEqual('TOP-1', getNodeMap(result).get(accounts[0].Id).typeLabel,
			'A type field that is not a picklist should come back as its value.');
	}

	@IsTest
	static void testActiveFieldIsMapped() {
		List<Account> accounts = insertAccountTree();

		// Account has no active checkbox in every org; IsDeleted is a checkbox every org has, false on every live row.
		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, null, 'IsDeleted', null, null);

		Assert.isFalse(getNodeMap(result).get(accounts[0].Id).isActive,
			'The active flag should carry the checkbox value, which is false here.');
	}

	@IsTest
	static void testNamesIgnoreCase() {
		insertAccountTree();

		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, ' account ', 'parentid', 'NAME', 'type', '', null, null);

		Assert.areEqual(4, result.nodes.size(), 'Object and field names should match whatever their case or spacing.');
	}

	@IsTest
	static void testBlankOptionalFields() {
		List<Account> accounts = insertAccountTree();

		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, '', null, null, null);

		HierarchyTreeController.HierarchyNode topNode = getNodeMap(result).get(accounts[0].Id);
		Assert.isNull(topNode.typeLabel, 'A blank type field should leave the type label empty.');
		Assert.isTrue(topNode.isActive, 'A blank active field should leave every node active.');
	}

	@IsTest
	static void testTruncation() {
		insertAccountTree();
		HierarchyTreeController.maxNodes = 2;

		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, null, null, null, null);

		Assert.areEqual(2, result.nodes.size(), 'The result should stop at the node limit.');
		Assert.isTrue(result.isTruncated, 'The result should say that more nodes exist than it returned.');
	}

	// Columns and avatar
	@IsTest
	static void testColumnsAreLabelledAndFormatted() {
		List<Account> accounts = insertAccountTree();
		accounts[0].AnnualRevenue = 1500000;
		update accounts[0];
		String expectedTypeLabel = null;
		for (Schema.PicklistEntry entry : Account.Type.getDescribe().getPicklistValues()) {
			if (entry.getValue() == 'Prospect') { expectedTypeLabel = entry.getLabel(); }
		}
		String ownerName = [SELECT Name FROM User WHERE Id = :UserInfo.getUserId()].Name;

		HierarchyTreeController.HierarchyResult result = getColumnHierarchy(
			'Type, AnnualRevenue, OwnerId, Parent.Name, CreatedDate', null);

		List<String> labels = new List<String>();
		List<String> dataTypes = new List<String>();
		for (HierarchyTreeController.HierarchyColumn column : result.columns) {
			labels.add(column.label);
			dataTypes.add(column.dataType);
		}
		Assert.areEqual(new List<String>{
				Account.Type.getDescribe().getLabel(), Account.AnnualRevenue.getDescribe().getLabel(), 'Owner',
				'Parent Account', Account.CreatedDate.getDescribe().getLabel() },
			labels, 'Columns should take field labels, with a lookup named after the relationship.');
		Assert.areEqual(new List<String>{ 'picklist', 'currency', 'string', 'string', 'datetime' }, dataTypes,
			'Each column should report its field type, and a lookup the type of the name it shows.');
		Map<String, HierarchyTreeController.HierarchyNode> nodeMap = getNodeMap(result);
		List<String> topValues = nodeMap.get(accounts[0].Id).columnValues;
		Assert.areEqual(expectedTypeLabel, topValues[0], 'A picklist column should show the label.');
		Assert.areEqual(expectedTypeLabel, nodeMap.get(accounts[0].Id).typeLabel,
			'The type badge should still read the label when the same field is also a column.');
		Assert.isTrue(topValues[1] != null && topValues[1] != '1500000' && topValues[1].contains('500'),
			'A currency column should come back formatted for the user, but was: ' + topValues[1]);
		Assert.areEqual(ownerName, topValues[2], 'A lookup column should show the related record name.');
		Assert.isNull(topValues[3], 'A lookup with no related record should leave the value empty.');
		Assert.areEqual(TOP_NAME, nodeMap.get(accounts[1].Id).columnValues[3],
			'Parent.Name should read through the lookup.');
		Assert.isNotNull(topValues[4], 'A date-time column should come back formatted.');
		Assert.isNull(nodeMap.get(accounts[1].Id).columnValues[1], 'A blank number should come back empty, not as text.');
	}

	@IsTest
	static void testRelatedFieldColumn() {
		insertAccountTree();
		String ownerAlias = [SELECT Alias FROM User WHERE Id = :UserInfo.getUserId()].Alias;

		HierarchyTreeController.HierarchyResult result = getColumnHierarchy('owner.alias', null);

		Assert.areEqual('Owner ' + User.Alias.getDescribe().getLabel(), result.columns[0].label,
			'A related field column should be labelled with the relationship and the field.');
		Assert.areEqual(ownerAlias, result.nodes[0].columnValues[0], 'A related field column should read the related value.');
	}

	@IsTest
	static void testRepeatedAndBlankColumnFieldsSkipped() {
		insertAccountTree();

		HierarchyTreeController.HierarchyResult result = getColumnHierarchy('Name, , name,', null);

		Assert.areEqual(1, result.columns.size(), 'Blank and repeated column fields should be skipped.');
		Assert.areEqual(TOP_NAME, result.nodes[0].columnValues[0], 'The name column may repeat the label field.');
	}

	@IsTest
	static void testAvatarField() {
		List<Account> accounts = insertAccountTree();

		HierarchyTreeController.HierarchyResult result = getColumnHierarchy(null, 'AccountNumber');

		Map<String, HierarchyTreeController.HierarchyNode> nodeMap = getNodeMap(result);
		Assert.areEqual('TOP-1', nodeMap.get(accounts[0].Id).avatarText, 'The avatar field should fill the avatar text.');
		Assert.isNull(nodeMap.get(accounts[1].Id).avatarText, 'A blank avatar field should leave the avatar text empty.');
		Assert.isTrue(result.columns.isEmpty(), 'Without column fields there should be no columns.');
	}

	@IsTest
	static void testTooManyColumnFieldsRefused() {
		String message = getColumnErrorMessage('Name, Type, Industry, Phone, Website, AccountNumber');

		Assert.isTrue(message.contains('at most 5'), 'More than five column fields should be refused, but got: ' + message);
	}

	@IsTest
	static void testUnknownColumnFieldRefused() {
		String message = getColumnErrorMessage('No_Such_Field__c');

		Assert.isTrue(message.contains('Unknown column field'),
			'An unknown column should be refused by name, but got: ' + message);
	}

	@IsTest
	static void testColumnFieldFollowsOneLookupOnly() {
		String message = getColumnErrorMessage('Parent.Owner.Name');

		Assert.isTrue(message.contains('one lookup only'), 'A path through two lookups should be refused, but got: ' + message);
	}

	@IsTest
	static void testUnknownLookupRefused() {
		String message = getColumnErrorMessage('Nobody.Name');

		Assert.isTrue(message.contains('Unknown lookup'), 'An unknown relationship should be refused, but got: ' + message);
	}

	@IsTest
	static void testUnknownRelatedFieldRefused() {
		String message = getColumnErrorMessage('Owner.No_Such_Field__c');

		Assert.isTrue(message.contains('Unknown column field'),
			'An unknown field behind a lookup should be refused, but got: ' + message);
	}

	// Refusals
	@IsTest
	static void testBlankObjectRefused() {
		String message = getErrorMessage('  ', PARENT_FIELD, LABEL_FIELD, null, null);

		Assert.isTrue(message.contains('Set the object API name'), 'A blank object should be refused, but got: ' + message);
	}

	@IsTest
	static void testUnknownObjectRefused() {
		String message = getErrorMessage('No_Such_Object__c', PARENT_FIELD, LABEL_FIELD, null, null);

		Assert.isTrue(message.contains('Unknown object'), 'An unknown object should be refused by name, but got: ' + message);
	}

	@IsTest
	static void testParentFieldMustPointAtSameObject() {
		String message = getErrorMessage(OBJECT_NAME, 'OwnerId', LABEL_FIELD, null, null);

		Assert.isTrue(message.contains('must be a lookup to Account'),
			'A parent field that looks up another object should be refused, but got: ' + message);
	}

	@IsTest
	static void testUnknownFieldRefused() {
		String message = getErrorMessage(OBJECT_NAME, PARENT_FIELD, 'No_Such_Field__c', null, null);

		Assert.isTrue(message.contains('Unknown name field'), 'An unknown field should be refused by name, but got: ' + message);
	}

	@IsTest
	static void testUnknownOptionalFieldRefused() {
		String message = getErrorMessage(OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, 'No_Such_Type__c', null);

		Assert.isTrue(message.contains('Unknown type field'),
			'A misspelt optional field should be refused rather than silently ignored, but got: ' + message);
	}

	@IsTest
	static void testActiveFieldMustBeCheckbox() {
		String message = getErrorMessage(OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, null, 'Name');

		Assert.isTrue(message.contains('must be a checkbox'), 'A non-checkbox active field should be refused, but got: ' + message);
	}

	@IsTest
	static void testObjectOutsideAllowListRefused() {
		HierarchyTreeController.ALLOWED_OBJECT_API_NAMES.add('Contact');

		String message = getErrorMessage(OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, null, null);

		Assert.isTrue(message.contains('is not allowed here'),
			'An object missing from a non-empty allow list should be refused, but got: ' + message);
	}

	@IsTest
	static void testObjectOnAllowListAccepted() {
		insertAccountTree();
		HierarchyTreeController.ALLOWED_OBJECT_API_NAMES.add('account');

		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, null, null, null, null);

		Assert.areEqual(4, result.nodes.size(), 'An object on the allow list should be read, whatever the case.');
	}
}
