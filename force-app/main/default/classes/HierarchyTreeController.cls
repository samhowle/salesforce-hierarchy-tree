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
	@TestVisible private static final Integer MAX_COLUMNS = 5;
	// Objects the component may read, by API name. Empty means any object the running user can read. In a real org,
	// list the hierarchy object here (for example 'AOR__c') so the component cannot be pointed at anything else.
	@TestVisible private static final Set<String> ALLOWED_OBJECT_API_NAMES = new Set<String>();
	// Number and date types the query formats for the user's locale and currency with FORMAT().
	private static final Set<Schema.DisplayType> FORMATTED_TYPES = new Set<Schema.DisplayType>{
		Schema.DisplayType.CURRENCY, Schema.DisplayType.DOUBLE, Schema.DisplayType.INTEGER, Schema.DisplayType.LONG,
		Schema.DisplayType.DATE, Schema.DisplayType.DATETIME
	};
	private static final Set<Schema.DisplayType> PICKLIST_TYPES = new Set<Schema.DisplayType>{
		Schema.DisplayType.PICKLIST, Schema.DisplayType.MULTIPICKLIST
	};
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
	// Sample codes follow a {Type}-{ShortCode} pattern; offices take the first three letters of their city.
	private static final Map<String, String> SAMPLE_CODES = new Map<String, String>{
		'Global' => 'GLB-WW', 'Americas' => 'REG-AMR', 'EMEA' => 'REG-EMEA', 'APAC' => 'REG-APAC',
		'United States' => 'CTR-US', 'Canada' => 'CTR-CA', 'Brazil' => 'CTR-BR', 'Mexico' => 'CTR-MX',
		'United Kingdom' => 'CTR-GB', 'Germany' => 'CTR-DE', 'France' => 'CTR-FR', 'South Africa' => 'CTR-ZA',
		'United Arab Emirates' => 'CTR-AE', 'Japan' => 'CTR-JP', 'Australia' => 'CTR-AU', 'India' => 'CTR-IN',
		'Singapore' => 'CTR-SG'
	};
	private static final List<String> SAMPLE_OWNERS = new List<String>{
		'Dana Whitfield', 'Luis Ortega', 'Ingrid Sorensen', 'Mei Tanaka', 'Priya Nair', 'Jordan Ellis', 'Felix Braun'
	};

	@TestVisible private static Integer maxNodes = DEFAULT_MAX_NODES;

	/**
	 * @param dataSource 'Records' reads the object named below; anything else returns the sample tree
	 * @param objectApiName the hierarchy object
	 * @param parentFieldApiName the object's lookup to itself
	 * @param labelFieldApiName the field shown as each node's name
	 * @param typeFieldApiName optional: a field shown as a badge (a picklist shows its label)
	 * @param activeFieldApiName optional: a checkbox; nodes where it is false can be muted or hidden by the component
	 * @param columnFieldApiNames optional: up to five comma-separated fields for the columns and the org-chart cards; a
	 *        lookup shows the related record's name, and Relationship.Field reads one field through one lookup
	 * @param avatarFieldApiName optional: a short text field, such as a code, shown in each org-chart card's avatar
	 * @return every node the running user can see, up to maxNodes, flagged when more exist
	 */
	@AuraEnabled(cacheable=true)
	public static HierarchyResult getHierarchy(String dataSource, String objectApiName, String parentFieldApiName,
			String labelFieldApiName, String typeFieldApiName, String activeFieldApiName, String columnFieldApiNames,
			String avatarFieldApiName) {
		if (dataSource != DATA_SOURCE_RECORDS) { return getSampleHierarchy(); }
		try {
			HierarchySource source = new HierarchySource(objectApiName, parentFieldApiName, labelFieldApiName);
			source.setTypeField(typeFieldApiName);
			source.setActiveField(activeFieldApiName);
			source.setAvatarField(avatarFieldApiName);
			source.setColumnFields(columnFieldApiNames);
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
		result.labelFieldLabel = source.labelFieldLabel;
		result.typeFieldLabel = source.typeFieldLabel;
		result.columns = source.getColumns();
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
		result.labelFieldLabel = 'Name';
		result.typeFieldLabel = 'Type';
		result.columns.add(new HierarchyColumn('Code', 'string'));
		result.columns.add(new HierarchyColumn('Owner', 'string'));
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
		Integer position = result.nodes.size();
		node.recordId = SAMPLE_KEY_PREFIX + String.valueOf(position + 1).leftPad(3, '0');
		node.parentId = parentId;
		node.label = label;
		node.typeLabel = typeLabel;
		node.isActive = (label != SAMPLE_INACTIVE_LABEL);
		node.avatarText = SAMPLE_CODES.containsKey(label)
			? SAMPLE_CODES.get(label)
			: 'OFC-' + label.replaceAll('[^A-Za-z]', '').left(3).toUpperCase();
		node.columnValues.add(node.avatarText);
		node.columnValues.add(SAMPLE_OWNERS[Math.mod(position, SAMPLE_OWNERS.size())]);
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
		public String labelFieldLabel;
		public String typeFieldLabel;
		private Map<String, Schema.SObjectField> fieldMap;
		private String parentFieldName;
		private String labelFieldName;
		private String typeFieldName;
		private Boolean isTypePicklist = false;
		private String activeFieldName;
		private String avatarFieldName;
		private List<ColumnField> columnFields = new List<ColumnField>();

		public HierarchySource(String objectApiName, String parentFieldApiName, String labelFieldApiName) {
			this.objectDescribe = getObjectDescribe(objectApiName);
			this.fieldMap = this.objectDescribe.fields.getMap();
			Schema.DescribeFieldResult parentDescribe = getFieldDescribe(parentFieldApiName, 'parent field');
			if (!parentDescribe.getReferenceTo().contains(this.objectDescribe.getSObjectType())) {
				throw new HierarchyConfigException('The parent field ' + parentDescribe.getName()
					+ ' must be a lookup to ' + this.objectDescribe.getName() + '.');
			}
			this.parentFieldName = getReadableName(parentDescribe, true);
			Schema.DescribeFieldResult labelDescribe = getFieldDescribe(labelFieldApiName, 'name field');
			this.labelFieldName = getReadableName(labelDescribe, true);
			this.labelFieldLabel = labelDescribe.getLabel();
		}

		public void setTypeField(String typeFieldApiName) {
			if (String.isBlank(typeFieldApiName)) { return; }
			Schema.DescribeFieldResult typeDescribe = getFieldDescribe(typeFieldApiName, 'type field');
			this.isTypePicklist = PICKLIST_TYPES.contains(typeDescribe.getType());
			this.typeFieldName = getReadableName(typeDescribe, false);
			this.typeFieldLabel = (this.typeFieldName == null) ? null : typeDescribe.getLabel();
		}

		public void setActiveField(String activeFieldApiName) {
			if (String.isBlank(activeFieldApiName)) { return; }
			Schema.DescribeFieldResult activeDescribe = getFieldDescribe(activeFieldApiName, 'active field');
			if (activeDescribe.getType() != Schema.DisplayType.BOOLEAN) {
				throw new HierarchyConfigException('The active field ' + activeDescribe.getName() + ' must be a checkbox.');
			}
			this.activeFieldName = getReadableName(activeDescribe, false);
		}

		public void setAvatarField(String avatarFieldApiName) {
			if (String.isBlank(avatarFieldApiName)) { return; }
			this.avatarFieldName = getReadableName(getFieldDescribe(avatarFieldApiName, 'avatar field'), false);
		}

		// Blank entries and repeats are skipped. A column the user cannot read is left out, like the other optional fields.
		public void setColumnFields(String columnFieldApiNames) {
			if (String.isBlank(columnFieldApiNames)) { return; }
			List<String> requestedNames = new List<String>();
			Set<String> seenNames = new Set<String>();
			for (String rawName : columnFieldApiNames.split(',')) {
				String fieldPath = rawName.trim();
				if (String.isBlank(fieldPath) || seenNames.contains(fieldPath.toLowerCase())) { continue; }
				seenNames.add(fieldPath.toLowerCase());
				requestedNames.add(fieldPath);
			}
			if (requestedNames.size() > MAX_COLUMNS) {
				throw new HierarchyConfigException('Set at most ' + MAX_COLUMNS + ' column fields.');
			}
			for (String fieldPath : requestedNames) {
				ColumnField column = fieldPath.contains('.') ? getRelatedColumn(fieldPath) : getDirectColumn(fieldPath);
				if (column == null) { continue; }
				column.setAlias('col' + this.columnFields.size());
				this.columnFields.add(column);
			}
		}

		public List<HierarchyColumn> getColumns() {
			List<HierarchyColumn> columns = new List<HierarchyColumn>();
			for (ColumnField column : this.columnFields) {
				columns.add(new HierarchyColumn(column.label, column.dataType));
			}
			return columns;
		}

		private ColumnField getDirectColumn(String fieldName) {
			Schema.DescribeFieldResult fieldDescribe = getFieldDescribe(fieldName, 'column field');
			if (!fieldDescribe.isAccessible()) { return null; }
			if (fieldDescribe.getType() == Schema.DisplayType.REFERENCE) {
				return getReferenceColumn(fieldDescribe, null, fieldName);
			}
			return new ColumnField(fieldDescribe.getLabel(), null, fieldDescribe);
		}

		// Relationship.Field, one lookup deep: Owner.Alias, Parent.Name, Manager__r.Email.
		private ColumnField getRelatedColumn(String fieldPath) {
			List<String> pathParts = fieldPath.split('\\.');
			if (pathParts.size() != 2 || String.isBlank(pathParts[0]) || String.isBlank(pathParts[1])) {
				throw new HierarchyConfigException('A column field can follow one lookup only: ' + fieldPath + '.');
			}
			Schema.DescribeFieldResult referenceDescribe = getReferenceByRelationship(pathParts[0].trim(), fieldPath);
			if (!referenceDescribe.isAccessible()) { return null; }
			return getReferenceColumn(referenceDescribe, pathParts[1].trim(), fieldPath);
		}

		// The lookup field behind a relationship name follows the platform's naming: Owner → OwnerId, Manager__r → Manager__c.
		private Schema.DescribeFieldResult getReferenceByRelationship(String relationshipName, String fieldPath) {
			String fieldName = relationshipName.endsWithIgnoreCase('__r')
				? relationshipName.left(relationshipName.length() - 3) + '__c'
				: relationshipName + 'Id';
			Schema.SObjectField fieldToken = this.fieldMap.get(fieldName);
			Schema.DescribeFieldResult referenceDescribe = (fieldToken == null) ? null : fieldToken.getDescribe();
			if (referenceDescribe == null || !relationshipName.equalsIgnoreCase(referenceDescribe.getRelationshipName())) {
				throw new HierarchyConfigException('Unknown lookup in the column field ' + fieldPath + '.');
			}
			return referenceDescribe;
		}

		// A lookup column shows the related record's name, or the named field. A lookup that can point at more than one
		// object, like Owner on most custom objects, offers only Name.
		private ColumnField getReferenceColumn(Schema.DescribeFieldResult referenceDescribe, String targetFieldName,
				String fieldPath) {
			String relationshipName = referenceDescribe.getRelationshipName();
			String lookupLabel = referenceDescribe.getLabel().removeEndIgnoreCase(' ID').trim();
			List<Schema.SObjectType> targetTypes = referenceDescribe.getReferenceTo();
			if (targetTypes.size() != 1) {
				if (targetFieldName != null && !targetFieldName.equalsIgnoreCase('Name')) {
					throw new HierarchyConfigException('Only Name can be shown through ' + relationshipName
						+ ', which can point at more than one object: ' + fieldPath + '.');
				}
				return new ColumnField(lookupLabel, relationshipName, 'Name', Schema.DisplayType.STRING);
			}
			Map<String, Schema.SObjectField> targetFieldMap = targetTypes[0]
				.getDescribe(SObjectDescribeOptions.DEFERRED).fields.getMap();
			Schema.DescribeFieldResult targetDescribe = (targetFieldName == null)
				? getNameFieldDescribe(targetFieldMap)
				: getTargetFieldDescribe(targetFieldMap, targetFieldName, fieldPath);
			if (targetDescribe == null || !targetDescribe.isAccessible()) { return null; }
			String label = targetDescribe.isNameField() ? lookupLabel : lookupLabel + ' ' + targetDescribe.getLabel();
			return new ColumnField(label, relationshipName, targetDescribe);
		}

		private Schema.DescribeFieldResult getTargetFieldDescribe(Map<String, Schema.SObjectField> targetFieldMap,
				String targetFieldName, String fieldPath) {
			Schema.SObjectField fieldToken = targetFieldMap.get(targetFieldName);
			if (fieldToken == null) {
				throw new HierarchyConfigException('Unknown column field: ' + fieldPath + '.');
			}
			return fieldToken.getDescribe();
		}

		private Schema.DescribeFieldResult getNameFieldDescribe(Map<String, Schema.SObjectField> targetFieldMap) {
			Schema.SObjectField nameToken = targetFieldMap.get('Name');
			if (nameToken != null && nameToken.getDescribe().isNameField()) { return nameToken.getDescribe(); }
			for (Schema.SObjectField fieldToken : targetFieldMap.values()) {
				Schema.DescribeFieldResult fieldDescribe = fieldToken.getDescribe();
				if (fieldDescribe.isNameField()) { return fieldDescribe; }
			}
			return null;
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
			for (String fieldName : new List<String>{
					this.parentFieldName, this.labelFieldName, this.activeFieldName, this.avatarFieldName }) {
				addSelectItem(selectItems, selectedNames, fieldName);
			}
			if (this.typeFieldName != null) {
				addSelectItem(selectItems, selectedNames,
					this.isTypePicklist ? 'toLabel(' + this.typeFieldName + ') typeText' : this.typeFieldName);
			}
			for (ColumnField column : this.columnFields) {
				addSelectItem(selectItems, selectedNames, column.selectItem);
			}
			return 'SELECT ' + String.join(selectItems, ', ') + ' FROM ' + this.objectDescribe.getName()
				+ ' ORDER BY Id LIMIT :rowLimit';
		}

		private void addSelectItem(List<String> selectItems, Set<String> selectedNames, String selectItem) {
			if (selectItem == null || selectedNames.contains(selectItem.toLowerCase())) { return; }
			selectItems.add(selectItem);
			selectedNames.add(selectItem.toLowerCase());
		}

		public HierarchyNode getNode(SObject rec) {
			HierarchyNode node = new HierarchyNode();
			node.recordId = rec.Id;
			node.parentId = getText(rec.get(this.parentFieldName));
			node.label = getText(rec.get(this.labelFieldName));
			if (this.typeFieldName != null) {
				node.typeLabel = getText(rec.get(this.isTypePicklist ? 'typeText' : this.typeFieldName));
			}
			node.isActive = (this.activeFieldName == null) || ((Boolean) rec.get(this.activeFieldName) != false);
			node.avatarText = (this.avatarFieldName == null) ? null : getText(rec.get(this.avatarFieldName));
			for (ColumnField column : this.columnFields) {
				node.columnValues.add(column.getValue(rec));
			}
			return node;
		}
	}

	// One column: what to select, where its value lands in the result, and how the component should align it.
	private class ColumnField {
		public String label;
		public String dataType;
		public String selectItem;
		private String relationshipName;
		private String fieldPath;
		private String valueKey;
		private Schema.DisplayType displayType;

		public ColumnField(String label, String relationshipName, Schema.DescribeFieldResult fieldDescribe) {
			this(label, relationshipName, fieldDescribe.getName(), fieldDescribe.getType());
		}

		public ColumnField(String label, String relationshipName, String fieldName, Schema.DisplayType displayType) {
			this.label = label;
			this.relationshipName = relationshipName;
			this.displayType = displayType;
			this.dataType = displayType.name().toLowerCase();
			this.fieldPath = (relationshipName == null) ? fieldName : relationshipName + '.' + fieldName;
			this.selectItem = this.fieldPath;
			this.valueKey = fieldName;
		}

		// Picklists come back as labels and numbers and dates as the user would see them, under an alias. On a lookup
		// the alias lands on the related record, which is where getValue reads it.
		public void setAlias(String alias) {
			if (PICKLIST_TYPES.contains(this.displayType)) {
				this.selectItem = 'toLabel(' + this.fieldPath + ') ' + alias;
				this.valueKey = alias;
			} else if (FORMATTED_TYPES.contains(this.displayType)) {
				this.selectItem = 'FORMAT(' + this.fieldPath + ') ' + alias;
				this.valueKey = alias;
			}
		}

		public String getValue(SObject rec) {
			SObject holder = (this.relationshipName == null) ? rec : rec.getSObject(this.relationshipName);
			String text = (holder == null) ? null : getText(holder.get(this.valueKey));
			if (text == null || this.displayType != Schema.DisplayType.PERCENT) { return text; }
			return text + '%';
		}
	}

	// FORMAT() returns an empty string for a blank number, so blank text counts as no value.
	private static String getText(Object val) {
		String text = (val == null) ? null : String.valueOf(val);
		return String.isBlank(text) ? null : text;
	}

	public class HierarchyResult {
		@AuraEnabled public List<HierarchyNode> nodes = new List<HierarchyNode>();
		@AuraEnabled public Boolean isTruncated = false;
		@AuraEnabled public String objectPluralLabel;
		@AuraEnabled public String labelFieldLabel;
		@AuraEnabled public String typeFieldLabel;
		@AuraEnabled public List<HierarchyColumn> columns = new List<HierarchyColumn>();
	}

	public class HierarchyColumn {
		@AuraEnabled public String label;
		@AuraEnabled public String dataType;

		public HierarchyColumn(String label, String dataType) {
			this.label = label;
			this.dataType = dataType;
		}
	}

	public class HierarchyNode {
		@AuraEnabled public String recordId;
		@AuraEnabled public String parentId;
		@AuraEnabled public String label;
		@AuraEnabled public String typeLabel;
		@AuraEnabled public Boolean isActive;
		@AuraEnabled public String avatarText;
		@AuraEnabled public List<String> columnValues = new List<String>();
	}

	private class HierarchyConfigException extends Exception {}
}
