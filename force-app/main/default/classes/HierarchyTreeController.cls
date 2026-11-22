/* HierarchyTreeController.cls   *********************************************************************************************
* Description:	Feeds c-hierarchy-tree one flat list of nodes: the records of any object with a lookup to itself, or a
*				built-in sample tree. Object and field names come from design attributes and are checked against the
*				schema before the one query runs, in user mode. README.md holds the reasoning and the fill-in steps.
* ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
* @testClass	HierarchyTreeControllerTest
******************************************************************************************************************************/
public with sharing class HierarchyTreeController {
	@TestVisible private static final String DATA_SOURCE_RECORDS = 'Records';
	@TestVisible private static final String DATA_SOURCE_SAMPLE = 'Sample';
	@TestVisible private static final Integer DEFAULT_MAX_NODES = 2000;
	// Objects the component may read, by API name. Empty means any object the running user can read. In a real org,
	// list the hierarchy object here (for example 'AOR__c') so the component cannot be pointed at anything else.
	@TestVisible private static final Set<String> ALLOWED_OBJECT_API_NAMES = new Set<String>();
	private static final String SAMPLE_PLURAL_LABEL = 'Locations';
	private static final String SAMPLE_KEY_PREFIX = 'sample-';
	private static final String SAMPLE_INACTIVE_LABEL = 'Austin Office';
	private static final Map<String, List<String>> SAMPLE_COUNTRIES_BY_REGION = new Map<String, List<String>>{
		'Americas' => new List<String>{ 'United States', 'Canada', 'Brazil', 'Mexico' },
		'EMEA' => new List<String>{ 'United Kingdom', 'Germany', 'France', 'South Africa', 'United Arab Emirates' },
		'APAC' => new List<String>{ 'Japan', 'Australia', 'India', 'Singapore' }
	};
	private static final Map<String, List<String>> SAMPLE_OFFICES_BY_COUNTRY = new Map<String, List<String>>{
		'United States' => new List<String>{ 'New York Office', 'Chicago Office', 'Austin Office', 'Seattle Office' },
		'Canada' => new List<String>{ 'Toronto Office', 'Vancouver Office' },
		'Brazil' => new List<String>{ 'Sao Paulo Office' },
		'United Kingdom' => new List<String>{ 'London Office', 'Manchester Office' },
		'Germany' => new List<String>{ 'Berlin Office', 'Munich Office' },
		'France' => new List<String>{ 'Paris Office' },
		'Japan' => new List<String>{ 'Tokyo Office', 'Osaka Office' },
		'Australia' => new List<String>{ 'Sydney Office', 'Melbourne Office' },
		'India' => new List<String>{ 'Bengaluru Office', 'Mumbai Office' },
		'Singapore' => new List<String>{ 'Singapore Office' }
	};

	@TestVisible private static Integer maxNodes = DEFAULT_MAX_NODES;

	/**
	 * @param dataSource 'Records' reads the object named below; anything else returns the sample tree
	 * @param objectApiName the hierarchy object
	 * @param parentFieldApiName the object's lookup to itself
	 * @param labelFieldApiName the field shown as each node's name
	 * @param typeFieldApiName optional: a field shown as a badge (a picklist shows its label)
	 * @param activeFieldApiName optional: a checkbox; nodes where it is false can be muted or hidden by the component
	 * @return every node the running user can see, up to maxNodes, flagged when more exist
	 */
	@AuraEnabled(cacheable=true)
	public static HierarchyResult getHierarchy(String dataSource, String objectApiName, String parentFieldApiName,
			String labelFieldApiName, String typeFieldApiName, String activeFieldApiName) {
		if (dataSource != DATA_SOURCE_RECORDS) { return getSampleHierarchy(); }
		try {
			HierarchySource source = new HierarchySource(objectApiName, parentFieldApiName, labelFieldApiName);
			source.setTypeField(typeFieldApiName);
			source.setActiveField(activeFieldApiName);
			return getRecordHierarchy(source);
		} catch (HierarchyConfigException ex) {
			throw getAuraException(ex.getMessage());
		} catch (QueryException ex) {
			throw getAuraException('The hierarchy query failed: ' + ex.getMessage());
		}
	}

	// Records
	private static HierarchyResult getRecordHierarchy(HierarchySource source) {
		HierarchyResult result = new HierarchyResult();
		result.objectPluralLabel = source.objectDescribe.getLabelPlural();
		Map<String, Object> bindMap = new Map<String, Object>{ 'rowLimit' => maxNodes + 1 };
		for (SObject rec : Database.queryWithBinds(source.getQuery(), bindMap, AccessLevel.USER_MODE)) {
			if (result.nodes.size() == maxNodes) {
				result.isTruncated = true;
				break;
			}
			result.nodes.add(source.getNode(rec));
		}
		return result;
	}

	// Sample
	private static HierarchyResult getSampleHierarchy() {
		HierarchyResult result = new HierarchyResult();
		result.objectPluralLabel = SAMPLE_PLURAL_LABEL;
		HierarchyNode globalNode = addSampleNode(result, 'Global', null, 'Global');
		for (String regionLabel : SAMPLE_COUNTRIES_BY_REGION.keySet()) {
			HierarchyNode regionNode = addSampleNode(result, regionLabel, globalNode.recordId, 'Region');
			for (String countryLabel : SAMPLE_COUNTRIES_BY_REGION.get(regionLabel)) {
				HierarchyNode countryNode = addSampleNode(result, countryLabel, regionNode.recordId, 'Country');
				List<String> officeLabels = SAMPLE_OFFICES_BY_COUNTRY.get(countryLabel);
				if (officeLabels == null) { continue; }
				for (String officeLabel : officeLabels) {
					addSampleNode(result, officeLabel, countryNode.recordId, 'Office');
				}
			}
		}
		return result;
	}

	private static HierarchyNode addSampleNode(HierarchyResult result, String label, String parentId, String typeLabel) {
		HierarchyNode node = new HierarchyNode();
		node.recordId = SAMPLE_KEY_PREFIX + String.valueOf(result.nodes.size() + 1).leftPad(3, '0');
		node.parentId = parentId;
		node.label = label;
		node.typeLabel = typeLabel;
		node.isActive = (label != SAMPLE_INACTIVE_LABEL);
		result.nodes.add(node);
		return node;
	}

	private static AuraHandledException getAuraException(String message) {
		AuraHandledException auraEx = new AuraHandledException(message);
		auraEx.setMessage(message);
		return auraEx;
	}

	// The object and fields, resolved from the schema. Every name in the query is the describe's own spelling, so
	// nothing typed into a design attribute ever reaches the query text.
	private class HierarchySource {
		public Schema.DescribeSObjectResult objectDescribe;
		private Map<String, Schema.SObjectField> fieldMap;
		private String parentFieldName;
		private String labelFieldName;
		private String typeFieldName;
		private Boolean isTypePicklist = false;
		private String activeFieldName;

		public HierarchySource(String objectApiName, String parentFieldApiName, String labelFieldApiName) {
			this.objectDescribe = getObjectDescribe(objectApiName);
			this.fieldMap = this.objectDescribe.fields.getMap();
			Schema.DescribeFieldResult parentDescribe = getFieldDescribe(parentFieldApiName, 'parent field');
			if (!parentDescribe.getReferenceTo().contains(this.objectDescribe.getSObjectType())) {
				throw new HierarchyConfigException('The parent field ' + parentDescribe.getName()
					+ ' must be a lookup to ' + this.objectDescribe.getName() + '.');
			}
			this.parentFieldName = getReadableName(parentDescribe, true);
			this.labelFieldName = getReadableName(getFieldDescribe(labelFieldApiName, 'name field'), true);
		}

		public void setTypeField(String typeFieldApiName) {
			if (String.isBlank(typeFieldApiName)) { return; }
			Schema.DescribeFieldResult typeDescribe = getFieldDescribe(typeFieldApiName, 'type field');
			Schema.DisplayType displayType = typeDescribe.getType();
			this.isTypePicklist = (displayType == Schema.DisplayType.PICKLIST
				|| displayType == Schema.DisplayType.MULTIPICKLIST);
			this.typeFieldName = getReadableName(typeDescribe, false);
		}

		public void setActiveField(String activeFieldApiName) {
			if (String.isBlank(activeFieldApiName)) { return; }
			Schema.DescribeFieldResult activeDescribe = getFieldDescribe(activeFieldApiName, 'active field');
			if (activeDescribe.getType() != Schema.DisplayType.BOOLEAN) {
				throw new HierarchyConfigException('The active field ' + activeDescribe.getName() + ' must be a checkbox.');
			}
			this.activeFieldName = getReadableName(activeDescribe, false);
		}

		private Schema.DescribeSObjectResult getObjectDescribe(String objectApiName) {
			if (String.isBlank(objectApiName)) {
				throw new HierarchyConfigException('Set the object API name to use the Records data source.');
			}
			List<Schema.DescribeSObjectResult> describes;
			try {
				describes = Schema.describeSObjects(new List<String>{ objectApiName.trim() }, SObjectDescribeOptions.DEFERRED);
			} catch (InvalidParameterValueException ex) {
				throw new HierarchyConfigException('Unknown object: ' + objectApiName.trim() + '.');
			}
			Schema.DescribeSObjectResult objDescribe = describes[0];
			if (!isAllowedObject(objDescribe.getName())) {
				throw new HierarchyConfigException('The object ' + objDescribe.getName() + ' is not allowed here.');
			}
			if (!objDescribe.isAccessible()) {
				throw new HierarchyConfigException('You do not have access to ' + objDescribe.getLabelPlural() + '.');
			}
			return objDescribe;
		}

		private Boolean isAllowedObject(String objectName) {
			if (ALLOWED_OBJECT_API_NAMES.isEmpty()) { return true; }
			for (String allowedName : ALLOWED_OBJECT_API_NAMES) {
				if (allowedName.equalsIgnoreCase(objectName)) { return true; }
			}
			return false;
		}

		private Schema.DescribeFieldResult getFieldDescribe(String fieldApiName, String role) {
			Schema.SObjectField fieldToken = String.isBlank(fieldApiName) ? null : this.fieldMap.get(fieldApiName.trim());
			if (fieldToken == null) {
				throw new HierarchyConfigException('Unknown ' + role + ' on ' + this.objectDescribe.getName() + ': '
					+ (String.isBlank(fieldApiName) ? '(blank)' : fieldApiName.trim()) + '.');
			}
			return fieldToken.getDescribe();
		}

		// A required field the user cannot read stops the query with a message naming it; an optional one is left out,
		// because user mode would otherwise fail the whole query on it.
		private String getReadableName(Schema.DescribeFieldResult fieldDescribe, Boolean isRequired) {
			if (fieldDescribe.isAccessible()) { return fieldDescribe.getName(); }
			if (!isRequired) { return null; }
			throw new HierarchyConfigException('You do not have access to the field ' + fieldDescribe.getName() + '.');
		}

		public String getQuery() {
			List<String> selectItems = new List<String>{ 'Id' };
			Set<String> selectedNames = new Set<String>{ 'id' };
			for (String fieldName : new List<String>{ this.parentFieldName, this.labelFieldName, this.activeFieldName }) {
				if (fieldName == null || selectedNames.contains(fieldName.toLowerCase())) { continue; }
				selectItems.add(fieldName);
				selectedNames.add(fieldName.toLowerCase());
			}
			if (this.typeFieldName != null && !selectedNames.contains(this.typeFieldName.toLowerCase())) {
				selectItems.add(this.isTypePicklist ? 'toLabel(' + this.typeFieldName + ')' : this.typeFieldName);
			}
			return 'SELECT ' + String.join(selectItems, ', ') + ' FROM ' + this.objectDescribe.getName()
				+ ' ORDER BY Id LIMIT :rowLimit';
		}

		public HierarchyNode getNode(SObject rec) {
			HierarchyNode node = new HierarchyNode();
			node.recordId = rec.Id;
			node.parentId = getText(rec.get(this.parentFieldName));
			node.label = getText(rec.get(this.labelFieldName));
			node.typeLabel = (this.typeFieldName == null) ? null : getText(rec.get(this.typeFieldName));
			node.isActive = (this.activeFieldName == null) || ((Boolean) rec.get(this.activeFieldName) != false);
			return node;
		}

		private String getText(Object val) {
			return (val == null) ? null : String.valueOf(val);
		}
	}

	public class HierarchyResult {
		@AuraEnabled public List<HierarchyNode> nodes = new List<HierarchyNode>();
		@AuraEnabled public Boolean isTruncated = false;
		@AuraEnabled public String objectPluralLabel;
	}

	public class HierarchyNode {
		@AuraEnabled public String recordId;
		@AuraEnabled public String parentId;
		@AuraEnabled public String label;
		@AuraEnabled public String typeLabel;
		@AuraEnabled public Boolean isActive;
	}

	private class HierarchyConfigException extends Exception {}
}
