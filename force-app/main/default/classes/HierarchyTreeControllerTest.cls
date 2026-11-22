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

	private static String getErrorMessage(String objectName, String parentField, String labelField, String typeField,
			String activeField) {
		try {
			HierarchyTreeController.getHierarchy(RECORDS, objectName, parentField, labelField, typeField, activeField);
		} catch (AuraHandledException ex) {
			return ex.getMessage();
		}
		Assert.fail('The configuration should have been refused, but the query ran.');
		return null;
	}

	// Sample
	@IsTest
	static void testSampleHierarchy() {
		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			HierarchyTreeController.DATA_SOURCE_SAMPLE, null, null, null, null, null);

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
	static void testUnknownDataSourceFallsBackToSample() {
		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			'Anything', OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, null, null);

		Assert.isTrue(result.nodes[0].recordId.startsWith('sample-'), 'An unknown data source should return the sample tree.');
	}

	// Records
	@IsTest
	static void testRecordHierarchyMapsParents() {
		List<Account> accounts = insertAccountTree();

		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, null, null);

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
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, TYPE_FIELD, null);

		Assert.areEqual(expectedLabel, getNodeMap(result).get(accounts[0].Id).typeLabel,
			'A picklist type field should come back as its label.');
	}

	@IsTest
	static void testTextTypeFieldUsesValue() {
		List<Account> accounts = insertAccountTree();

		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, 'AccountNumber', null);

		Assert.areEqual('TOP-1', getNodeMap(result).get(accounts[0].Id).typeLabel,
			'A type field that is not a picklist should come back as its value.');
	}

	@IsTest
	static void testActiveFieldIsMapped() {
		List<Account> accounts = insertAccountTree();

		// Account has no active checkbox in every org; IsDeleted is a checkbox every org has, false on every live row.
		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, null, 'IsDeleted');

		Assert.isFalse(getNodeMap(result).get(accounts[0].Id).isActive,
			'The active flag should carry the checkbox value, which is false here.');
	}

	@IsTest
	static void testNamesIgnoreCase() {
		insertAccountTree();

		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, ' account ', 'parentid', 'NAME', 'type', '');

		Assert.areEqual(4, result.nodes.size(), 'Object and field names should match whatever their case or spacing.');
	}

	@IsTest
	static void testBlankOptionalFields() {
		List<Account> accounts = insertAccountTree();

		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, '', null);

		HierarchyTreeController.HierarchyNode topNode = getNodeMap(result).get(accounts[0].Id);
		Assert.isNull(topNode.typeLabel, 'A blank type field should leave the type label empty.');
		Assert.isTrue(topNode.isActive, 'A blank active field should leave every node active.');
	}

	@IsTest
	static void testTruncation() {
		insertAccountTree();
		HierarchyTreeController.maxNodes = 2;

		HierarchyTreeController.HierarchyResult result = HierarchyTreeController.getHierarchy(
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, null, null);

		Assert.areEqual(2, result.nodes.size(), 'The result should stop at the node limit.');
		Assert.isTrue(result.isTruncated, 'The result should say that more nodes exist than it returned.');
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
			RECORDS, OBJECT_NAME, PARENT_FIELD, LABEL_FIELD, null, null);

		Assert.areEqual(4, result.nodes.size(), 'An object on the allow list should be read, whatever the case.');
	}
}
