import boto3
import pytest
from moto import mock_aws

from app.config import Settings
from app.workers.provisioner import get_worker_state, launch_worker, terminate_worker


def _amazon_ami(region: str = "us-east-1") -> str:
    """Grab one of moto's canned Amazon-owned AMIs to launch from."""
    images = boto3.client("ec2", region_name=region).describe_images(Owners=["amazon"])[
        "Images"
    ]
    return images[0]["ImageId"]


def _settings(ami: str) -> Settings:
    # _env_file=None: don't let values from router/.env leak into the test.
    return Settings(
        _env_file=None,
        aws_region="us-east-1",
        worker_ami_id=ami,
        worker_instance_type="t3.small",
        worker_image_uri="123456789012.dkr.ecr.us-east-1.amazonaws.com/clip:latest",
        worker_tag_project="livestream-clipper",
        worker_ebs_volume_size_gb=50,
    )


@mock_aws
def test_launch_worker_creates_tagged_instance():
    settings = _settings(_amazon_ami())

    instance_id = launch_worker(
        project_id="proj-123",
        source_url="https://www.youtube.com/watch?v=abc",
        source_type="video",
        settings=settings,
    )

    assert instance_id.startswith("i-")

    ec2 = boto3.client("ec2", region_name="us-east-1")
    instance = ec2.describe_instances(InstanceIds=[instance_id])["Reservations"][0][
        "Instances"
    ][0]
    assert instance["InstanceType"] == "t3.small"

    tags = {t["Key"]: t["Value"] for t in instance["Tags"]}
    assert tags["Project"] == "livestream-clipper"
    assert tags["Role"] == "clip-worker"
    assert tags["ProjectId"] == "proj-123"


@mock_aws
def test_launch_worker_requires_ami_and_image():
    with pytest.raises(ValueError, match="WORKER_AMI_ID"):
        launch_worker(
            project_id="p",
            source_url="u",
            source_type="video",
            settings=Settings(_env_file=None),
        )

    with pytest.raises(ValueError, match="WORKER_IMAGE_URI"):
        launch_worker(
            project_id="p",
            source_url="u",
            source_type="video",
            settings=Settings(_env_file=None, worker_ami_id="ami-123"),
        )


@mock_aws
def test_state_and_terminate():
    settings = _settings(_amazon_ami())
    instance_id = launch_worker(
        project_id="proj-9",
        source_url="u",
        source_type="video",
        settings=settings,
    )

    assert get_worker_state(instance_id) in {"pending", "running"}

    terminate_worker(instance_id)
    assert get_worker_state(instance_id) in {"shutting-down", "terminated"}
